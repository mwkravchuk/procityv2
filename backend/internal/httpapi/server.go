package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/procity/procityv2/backend/internal/draft"
	"github.com/procity/procityv2/backend/internal/queue"
)

type Server struct {
	draftSvc *draft.Service
	draftHub *draft.Hub
	queueSvc *queue.Service
	pool     *pgxpool.Pool
}

func NewServer(pool *pgxpool.Pool) *Server {
	return &Server{
		draftSvc: draft.NewService(pool),
		draftHub: draft.NewHub(),
		queueSvc: queue.NewService(pool),
		pool:     pool,
	}
}

var draftUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(cors)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	r.Post("/auth/dev-login", s.handleDevLogin)
	r.Get("/queue/state", s.handleQueueState)
	r.Post("/queue/join", s.handleQueueJoin)
	r.Post("/queue/leave", s.handleQueueLeave)

	r.Post("/matches/{matchID}/draft/captains", s.handleDraftAssignCaptains)
	r.Get("/matches/{matchID}/draft/state", s.handleDraftState)
	r.Post("/matches/{matchID}/draft/picks", s.handleDraftPick)
	r.Get("/matches/{matchID}/draft/ws", s.handleDraftSocket)

	return r
}

type devLoginRequest struct {
	DisplayName string `json:"displayName"`
}

type userResponse struct {
	ID          int64  `json:"id"`
	DisplayName string `json:"displayName"`
}

func (s *Server) handleDevLogin(w http.ResponseWriter, r *http.Request) {
	var req devLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	displayName := strings.TrimSpace(req.DisplayName)
	if displayName == "" {
		writeError(w, http.StatusBadRequest, "displayName is required")
		return
	}

	var user userResponse
	err := s.pool.QueryRow(r.Context(), `
		INSERT INTO users (display_name)
		VALUES ($1)
		ON CONFLICT (display_name)
		DO UPDATE SET display_name = EXCLUDED.display_name
		RETURNING id, display_name
	`, displayName).Scan(&user.ID, &user.DisplayName)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to login user")
		return
	}

	writeJSON(w, http.StatusOK, user)
}

type queueActionRequest struct {
	UserID int64 `json:"userId"`
}

func (s *Server) handleQueueJoin(w http.ResponseWriter, r *http.Request) {
	var req queueActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if req.UserID <= 0 {
		writeError(w, http.StatusBadRequest, "userId must be positive")
		return
	}

	result, err := s.queueSvc.Join(r.Context(), req.UserID)
	if err != nil {
		if errors.Is(err, queue.ErrAlreadyQueued) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		if errors.Is(err, queue.ErrNoActiveMaps) {
			writeError(w, http.StatusUnprocessableEntity, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to join queue")
		return
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleQueueLeave(w http.ResponseWriter, r *http.Request) {
	var req queueActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if req.UserID <= 0 {
		writeError(w, http.StatusBadRequest, "userId must be positive")
		return
	}

	err := s.queueSvc.Leave(r.Context(), req.UserID)
	if err != nil {
		if errors.Is(err, queue.ErrNotQueued) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to leave queue")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "left"})
}

func (s *Server) handleQueueState(w http.ResponseWriter, r *http.Request) {
	state, err := s.queueSvc.State(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load queue state")
		return
	}

	userID, hasUserID, ok := optionalUserIDFromQuery(w, r)
	if !ok {
		return
	}
	if hasUserID {
		activeMatchID, err := s.draftSvc.ActiveMatchForUser(r.Context(), userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load active match")
			return
		}
		state.ActiveMatchID = activeMatchID
	}

	writeJSON(w, http.StatusOK, state)
}

type draftPickRequest struct {
	CaptainUserID int64 `json:"captainUserId"`
	PickedUserID  int64 `json:"pickedUserId"`
	PickNumber    int16 `json:"pickNumber"`
}

func (s *Server) handleDraftAssignCaptains(w http.ResponseWriter, r *http.Request) {
	matchID, ok := matchIDFromRequest(w, r)
	if !ok {
		return
	}
	userID, ok := requiredUserIDFromQuery(w, r)
	if !ok {
		return
	}
	if err := s.draftSvc.RequireParticipant(r.Context(), matchID, userID); err != nil {
		s.writeDraftError(w, err)
		return
	}

	if err := s.draftSvc.AssignCaptains(r.Context(), matchID); err != nil {
		s.writeDraftError(w, err)
		return
	}

	state, err := s.draftSvc.State(r.Context(), matchID)
	if err != nil {
		s.writeDraftError(w, err)
		return
	}

	s.draftHub.Broadcast(state)
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleDraftState(w http.ResponseWriter, r *http.Request) {
	matchID, ok := matchIDFromRequest(w, r)
	if !ok {
		return
	}
	userID, ok := requiredUserIDFromQuery(w, r)
	if !ok {
		return
	}

	state, err := s.draftSvc.StateForUser(r.Context(), matchID, userID)
	if err != nil {
		s.writeDraftError(w, err)
		return
	}

	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleDraftPick(w http.ResponseWriter, r *http.Request) {
	matchID, ok := matchIDFromRequest(w, r)
	if !ok {
		return
	}

	var req draftPickRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.CaptainUserID <= 0 {
		writeError(w, http.StatusBadRequest, "captainUserId must be positive")
		return
	}
	if req.PickedUserID <= 0 {
		writeError(w, http.StatusBadRequest, "pickedUserId must be positive")
		return
	}
	if req.PickNumber < 1 || req.PickNumber > 8 {
		writeError(w, http.StatusBadRequest, "pickNumber must be between 1 and 8")
		return
	}

	if err := s.draftSvc.RequireParticipant(r.Context(), matchID, req.CaptainUserID); err != nil {
		s.writeDraftError(w, err)
		return
	}

	err := s.draftSvc.SubmitPick(r.Context(), matchID, draft.SubmitPickInput{
		CaptainUserID: req.CaptainUserID,
		PickedUserID:  req.PickedUserID,
		PickNumber:    req.PickNumber,
	})
	if err != nil {
		s.writeDraftError(w, err)
		return
	}

	state, err := s.draftSvc.State(r.Context(), matchID)
	if err != nil {
		s.writeDraftError(w, err)
		return
	}

	s.draftHub.Broadcast(state)
	writeJSON(w, http.StatusOK, state)
}

func (s *Server) handleDraftSocket(w http.ResponseWriter, r *http.Request) {
	matchID, ok := matchIDFromRequest(w, r)
	if !ok {
		return
	}
	userID, ok := requiredUserIDFromQuery(w, r)
	if !ok {
		return
	}

	state, err := s.draftSvc.StateForUser(r.Context(), matchID, userID)
	if err != nil {
		s.writeDraftError(w, err)
		return
	}

	conn, err := draftUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	go func() {
		defer cancel()
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	updates, unsubscribe := s.draftHub.Subscribe(matchID)
	defer unsubscribe()

	if err := conn.WriteJSON(state); err != nil {
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case nextState, ok := <-updates:
			if !ok {
				return
			}
			if err := conn.WriteJSON(nextState); err != nil {
				return
			}
		}
	}
}

func matchIDFromRequest(w http.ResponseWriter, r *http.Request) (int64, bool) {
	matchID, err := strconv.ParseInt(chi.URLParam(r, "matchID"), 10, 64)
	if err != nil || matchID <= 0 {
		writeError(w, http.StatusBadRequest, "matchID must be positive")
		return 0, false
	}
	return matchID, true
}

func requiredUserIDFromQuery(w http.ResponseWriter, r *http.Request) (int64, bool) {
	userID, hasUserID, ok := optionalUserIDFromQuery(w, r)
	if !ok {
		return 0, false
	}
	if !hasUserID {
		writeError(w, http.StatusBadRequest, "userId query parameter is required")
		return 0, false
	}
	return userID, true
}

func optionalUserIDFromQuery(w http.ResponseWriter, r *http.Request) (int64, bool, bool) {
	rawUserID := strings.TrimSpace(r.URL.Query().Get("userId"))
	if rawUserID == "" {
		return 0, false, true
	}
	userID, err := strconv.ParseInt(rawUserID, 10, 64)
	if err != nil || userID <= 0 {
		writeError(w, http.StatusBadRequest, "userId must be positive")
		return 0, false, false
	}
	return userID, true, true
}

func (s *Server) writeDraftError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, draft.ErrMatchNotFound):
		writeError(w, http.StatusNotFound, err.Error())
	case errors.Is(err, draft.ErrMatchNotDrafting):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, draft.ErrInvalidCaptains), errors.Is(err, draft.ErrExpectedTwoCaptains):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, draft.ErrDraftComplete):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, draft.ErrInvalidPickNumber):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, draft.ErrNotCaptainTurn):
		writeError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, draft.ErrPlayerUnavailable):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, draft.ErrMatchAccessDenied):
		writeError(w, http.StatusForbidden, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, "failed to update draft")
	}
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	b, err := json.Marshal(payload)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(`{"error":"serialization error"}`))
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_, _ = w.Write(b)
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
