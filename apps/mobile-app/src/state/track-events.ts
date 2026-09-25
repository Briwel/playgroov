type TrackDeletedListener = (trackId: string) => void;

const trackDeletedListeners = new Set<TrackDeletedListener>();

export function subscribeToTrackDeleted(listener: TrackDeletedListener) {
  trackDeletedListeners.add(listener);
  return () => {
    trackDeletedListeners.delete(listener);
  };
}

export function notifyTrackDeleted(trackId: string) {
  trackDeletedListeners.forEach((listener) => {
    try {
      listener(trackId);
    } catch (error) {
      console.warn('Unable to stop audio for deleted track', error);
    }
  });
}
