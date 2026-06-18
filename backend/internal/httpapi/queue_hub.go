package httpapi

import "sync"

type queueHub struct {
	mu          sync.Mutex
	subscribers map[chan struct{}]struct{}
}

func newQueueHub() *queueHub {
	return &queueHub{
		subscribers: map[chan struct{}]struct{}{},
	}
}

func (h *queueHub) Subscribe() (<-chan struct{}, func()) {
	updates := make(chan struct{}, 1)

	h.mu.Lock()
	h.subscribers[updates] = struct{}{}
	h.mu.Unlock()

	unsubscribe := func() {
		h.mu.Lock()
		defer h.mu.Unlock()

		delete(h.subscribers, updates)
		close(updates)
	}

	return updates, unsubscribe
}

func (h *queueHub) Broadcast() {
	h.mu.Lock()
	defer h.mu.Unlock()

	for updates := range h.subscribers {
		select {
		case updates <- struct{}{}:
		default:
		}
	}
}
