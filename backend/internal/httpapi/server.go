package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/procity/procityv2/backend/internal/queue"
)

type Server struct {
	queueSvc *queue.Service
	pool     *pgxpool.Pool
}

func NewServer(pool *pgxpool.Pool) *Server {
	return &Server{
		queueSvc: queue.NewService(pool),
		pool:     pool,
	}
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

	writeJSON(w, http.StatusOK, state)
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
