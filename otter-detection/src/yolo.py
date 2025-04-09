import numpy


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


def non_max_suppression_fast(detections, nms_threshold, top_k=16, n=128):
    # NOTE: Customised overlap removal logic to prioritise high conf boxes
    detections.sort(key=lambda x: x["confidence"], reverse=True)
    # NOTE: Prioritise higher confidence boxes, skip lower ones if too many
    detections = detections[:n]
    selected = []
    for p1 in detections:
        if len(selected) > top_k:  # Conserve CPU
            break
        for p2 in selected:
            if intersect_over_union(p1["box"], p2["box"]) > nms_threshold:
                break
        else:
            selected.append(p1)
    return selected


def postprocess_message(x):
    if isinstance(x, (list, tuple)):
        return [postprocess_message(xx) for xx in x]
    elif isinstance(x, dict):
        return {k: postprocess_message(v) for k, v in x.items()}
    elif hasattr(x, "item"):
        return x.item()
    else:
        return x


def decode_yolo(tensor, classes):
    tensor[:, 5:] *= tensor[:, 4].reshape(-1, 1)
    all_detections = []
    for class_entry in classes:
        class_index = class_entry["index"]
        name = class_entry["name"]
        conf_threshold = class_entry.get("confidence", 0.5)
        nms_threshold = class_entry.get("nms", 0.5)
        a = tensor[tensor[:, 5+class_index] > conf_threshold]
        detections = [dict(box=box.tolist(), name=name, confidence=float(conf))
                      for box, conf in zip(a[:, :4], a[:, 5+class_index])]
        detections = non_max_suppression_fast(detections, nms_threshold)
        all_detections.extend(detections)
    all_detections = postprocess_message(all_detections)
    return all_detections
