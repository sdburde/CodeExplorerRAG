import numpy
from scipy.optimize import linear_sum_assignment


def xywh_to_xyxy(x, y, w, h):
    ww, hh = w / 2, h / 2
    return x - ww, y - hh, x + ww, y + hh


def calculate_areas(a, b):
    a_x0, a_y0, a_x1, a_y1 = xywh_to_xyxy(*a)
    b_x0, b_y0, b_x1, b_y1 = xywh_to_xyxy(*b)
    y0, y1 = max(a_y0, b_y0), min(a_y1, b_y1)
    x0, x1 = max(a_x0, b_x0), min(a_x1, b_x1)
    area1 = (a_x1 - a_x0) * (a_y1 - a_y0)
    area2 = (b_x1 - b_x0) * (b_y1 - b_y0)
    area3 = (x1 - x0) * (y1 - y0) if x1 > x0 and y1 > y0 else 0
    return area1, area2, area3


def intersect_over_union(a, b):
    area1, area2, area3 = calculate_areas(a, b)
    return area3 / (area1 + area2 - area3)


def solve_track_assignment(detections, tracks, iou_threshold):
    detections, tracks = detections[:], tracks[:]
    iou_mat = numpy.zeros((len(detections), len(tracks)))
    for i, d in enumerate(detections):
        for j, t in enumerate(tracks):
            iou_mat[i][j] = intersect_over_union(d["box"], t["box"])
    row_indices, col_indices = linear_sum_assignment(1 - iou_mat)
    for i, j in zip(row_indices, col_indices):
        if iou_mat[i][j] > iou_threshold:
            yield detections[i], tracks[j]


class Tracker:
    def __init__(self):
        self.tracks = []

    def handle_miss(self, track, stamp):
        if "first_stamp" not in track:
            track["first_stamp"] = stamp
        track["last_stamp"] = stamp
        track["last_hit"] = None
        # Start tracking consecutive miss time if not yet
        if track.get("last_miss") is None:
            track["last_miss"] = stamp
        if track.get("confirmed"):
            x, y, w, h = track["box"]
            dx, dy = track["dxy"]
            # NOTE: Width and height are not propagated for stability
            track["box"] = x + dx, y + dy, w, h
        miss_duration = stamp - track["last_miss"]
        if miss_duration > 1:
            self.tracks.remove(track)
            tid = track.get("confirmed")
            # print(f"Remove track missing for {miss_duration:.2f}s. "
            #       f"Total {len(self.tracks)} tracks")

    def handle_hit(self, track, detection, stamp):
        # Update first and last timestamps
        if "first_stamp" not in track:
            track["first_stamp"] = stamp
        track["last_stamp"] = stamp
        # Invalidate last miss timestamp
        track["last_miss"] = None
        # Start tracking consecutive hit time if not yet
        if track.get("last_hit") is None:
            track["last_hit"] = stamp
        smooth = 0.9
        x1, y1, *_ = detection["box"]
        x0, y0, *_ = track.get("box", (x1, y1))
        dx, dy = track.get("dxy", (0, 0))
        # NOTE: Smooth dx and dy to prevent only last 2 frames dominating future diffs
        dx = smooth * dx + (1 - smooth) * (x1 - x0)
        dy = smooth * dy + (1 - smooth) * (y1 - y0)
        track["dxy"] = dx, dy
        # Accumulate total displacement
        track["box"] = detection["box"]
        # Update maximum confidence
        confidence = track.get("max_confidence", 0)
        track["max_confidence"] = max(confidence, detection["confidence"])
        # Calculate total displacement
        total_xy = track.get("total_xy", 0)
        dx, dy = track.get("dxy", (0, 0))
        total_xy += (dx ** 2 + dy ** 2) ** 0.5  # Euclidean
        track["total_xy"] = total_xy
        # Calculate total speed
        dt = track["last_stamp"] - track["first_stamp"]
        speed = 0 if dt == 0 else (total_xy / dt)
        track["speed"] = speed
        # Confirm track if consecutively hit for long enough
        if not track.get("confirmed"):
            hit_duration = stamp - track["last_hit"]
            if hit_duration > 0.5:
                track["confirmed"] = True
                # print(f"Confirm track hitting for {hit_duration:.2f}s. "
                #       f"Total {len(self.tracks)} tracks")
            
        # Mark track as positive if fullfil specific criteria
        if not track.get("positive"):
            confidence = track.get("max_confidence", 0)
            if 0.001 < speed < 0.20 and confidence > 0.6:
                track["positive"] = True
                nc = sum(x.get("positive", False) for x in self.tracks)
                print(f"Confirm positive with speed {speed:.3f} and confidence {confidence:.3f}. "
                      f"Total {nc}/{len(self.tracks)} positives")
        # Invalidate fast moving positives
        # NOTE: Some object moves slow at first, then becomes fast later
        if track.get("positive"):
            if speed > 0.50: # Move half screen space per second
                track["positive"] = False
                nc = sum(x.get("positive", False) for x in self.tracks)
                print(f"Negative with speed {speed:.3f} and confidence {confidence:.3f}. "
                      f"Total {nc}/{len(self.tracks)} positives")

    def __call__(self, detections, stamp, iou_threshold=0.01):
        detections, tracks = detections[:], self.tracks[:]
        # Group tracks to solve linear assignment at different priorities
        positive_tracks, confirmed_tracks, leftover_tracks = [], [], []
        for t in tracks:
            if t.get("positive"):
                positive_tracks.append(t)
            elif t.get("confirmed"):
                confirmed_tracks.append(t)
            else:
                leftover_tracks.append(t)
        for track_subset in [positive_tracks, confirmed_tracks, leftover_tracks]:
            for d, t in solve_track_assignment(detections, track_subset, iou_threshold):
                self.handle_hit(t, d, stamp)
                # Remove assigned detections and tracks
                tracks.remove(t)
                detections.remove(d)
        # Handle unassigned detections
        for d in detections:
            t = dict()
            self.tracks.append(t)
            self.handle_hit(t, d, stamp)
            # print(f"Add track. Total {len(self.tracks)} tracks")
        # Handle unassigned tracks
        for t in tracks:
            self.handle_miss(t, stamp)
