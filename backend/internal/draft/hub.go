package draft

import (
	"sync"

	"github.com/procity/procityv2/backend/internal/models"
)

type Hub struct {
	mu          sync.Mutex
	subscribers map[int64]map[chan models.DraftState]struct{}
}

func NewHub() *Hub {
	return &Hub{
		subscribers: map[int64]map[chan models.DraftState]struct{}{},
	}
}

func (h *Hub) Subscribe(matchID int64) (<-chan models.DraftState, func()) {
	updates := make(chan models.DraftState, 1)

	h.mu.Lock()
	if h.subscribers[matchID] == nil {
		h.subscribers[matchID] = map[chan models.DraftState]struct{}{}
	}
	h.subscribers[matchID][updates] = struct{}{}
	h.mu.Unlock()

	unsubscribe := func() {
		h.mu.Lock()
		defer h.mu.Unlock()

		delete(h.subscribers[matchID], updates)
		if len(h.subscribers[matchID]) == 0 {
			delete(h.subscribers, matchID)
		}
		close(updates)
	}

	return updates, unsubscribe
}

func (h *Hub) Broadcast(state models.DraftState) {
	h.mu.Lock()
	defer h.mu.Unlock()

	for updates := range h.subscribers[state.Match.ID] {
		select {
		case updates <- state:
		default:
			select {
			case <-updates:
			default:
			}
			select {
			case updates <- state:
			default:
			}
		}
	}
}
