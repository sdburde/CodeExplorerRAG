from tracker import Tracker

# Time unit in presentation time stamp (PTS) seconds
WAIT_FOR_MORE_POSITIVE = 10
COOLDOWN = 30


class DetectionAnalyser:
    def __init__(self):
        self.tracker = Tracker()
        self.reset_states()

    def reset_states(self):
        print("Reset track analyser state")
        self.first_positive = None
        self.last_positive = None
        self.num_positive = 0
        self.last_update = None
        self.last_event = None  # For cooldown

    def __call__(self, detections, frame, pts):

        self.tracker(detections, stamp=pts)

        num_positive = len([x for x in self.tracker.tracks
                            if x.get("positive") and x.get("last_miss") is None])

        if num_positive > 0:
            if self.first_positive is None:
                self.first_positive = pts
            self.last_positive = pts

        if num_positive > self.num_positive:
            print(f"Update positive count {num_positive}")
            self.last_update = pts
            self.num_positive = num_positive

        num_positive_stable = False
        if self.last_update is not None:
            if pts - self.last_update > WAIT_FOR_MORE_POSITIVE:
                num_positive_stable = True

        off_cooldown = False
        if self.last_event is None:
            off_cooldown = True
        elif pts - self.last_event > COOLDOWN:
            off_cooldown = True

        if num_positive_stable:
            print(f"Finalising event: {self.num_positive} positives")
            if off_cooldown:
                print("Dispatch event")
                # TODO: DISPATCH
                self.reset_states()
                self.last_event = pts
            else:
                print("Skip dispatching event. On cooldown")
                self.reset_states()

    def get_detections(self):
        detections = [
            dict(
                box=track["box"],
                confidence=track.get("max_confidence"),
                positive=track.get("positive"),
                speed=track.get("speed"),
            )
            for track in self.tracker.tracks
            # NOTE: Only return confirmed track AND currently HIT track only
            if track.get("confirmed") and track.get("last_miss") is None
        ]
        return detections
