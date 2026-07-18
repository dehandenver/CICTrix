# backend/test_competency_assessment_math.py
"""
Unit test for pure-logic aggregation math of competency assessment.
Verifies confidence-weighted calculations, handling of NULL/unrated indicators,
and mapping edge cases.
"""

def calculate_competency_score(comp_matches, ratings_by_si, si_to_composite):
    valid_ratings = []
    total_confidence = 0.0
    weighted_sum = 0.0
    
    for m in comp_matches:
        si_id = m.get("success_indicator_id")
        if not si_id:
            target_txt = m.get("target_text", "").strip().lower()
            for sid, comp_txt in si_to_composite.items():
                if comp_txt.strip().lower() == target_txt:
                    si_id = sid
                    break
        
        if not si_id:
            continue
            
        rating = ratings_by_si.get(si_id)
        if not rating:
            continue
            
        q = rating.get("quality")
        e = rating.get("efficiency")
        t = rating.get("timeliness")
        scores = [s for s in [q, e, t] if s is not None]
        
        if scores:
            avg_rating = sum(scores) / len(scores)
            confidence = float(m.get("confidence") or 1.0)
            
            valid_ratings.append(avg_rating)
            weighted_sum += avg_rating * confidence
            total_confidence += confidence
            
    if valid_ratings:
        if total_confidence > 0:
            return round(weighted_sum / total_confidence, 2)
        return round(sum(valid_ratings) / len(valid_ratings), 2)
    return None

def test_aggregation_math():
    print("Running competency score aggregation math tests...")
    
    # ── Test 1: Multiple targets with different ratings and confidences ──
    comp_matches = [
        {"success_indicator_id": "si-1", "confidence": 0.9, "competency": "Programming"},
        {"success_indicator_id": "si-2", "confidence": 0.5, "competency": "Programming"},
    ]
    ratings_by_si = {
        "si-1": {"quality": 4, "efficiency": 4, "timeliness": 4}, # avg = 4.0
        "si-2": {"quality": 2, "efficiency": 3, "timeliness": None}, # avg = 2.5
    }
    si_to_composite = {}
    
    # Expected weighted avg = ((4.0 * 0.9) + (2.5 * 0.5)) / (0.9 + 0.5)
    #                      = (3.6 + 1.25) / 1.4 = 4.85 / 1.4 = 3.464... -> 3.46
    score = calculate_competency_score(comp_matches, ratings_by_si, si_to_composite)
    assert score == 3.46, f"Test 1 failed: Expected 3.46, got {score}"
    print("✅ Test 1 Passed: Multiple targets with weighted confidence calculated correctly.")

    # ── Test 2: Unrated success indicators (should be ignored) ──
    comp_matches = [
        {"success_indicator_id": "si-1", "confidence": 1.0, "competency": "Programming"},
        {"success_indicator_id": "si-2", "confidence": 1.0, "competency": "Programming"},
    ]
    ratings_by_si = {
        "si-1": {"quality": 5, "efficiency": 5, "timeliness": 5}, # avg = 5.0
        "si-2": {"quality": None, "efficiency": None, "timeliness": None}, # unrated
    }
    score = calculate_competency_score(comp_matches, ratings_by_si, si_to_composite)
    assert score == 5.0, f"Test 2 failed: Expected 5.0, got {score}"
    print("✅ Test 2 Passed: Unrated indicators correctly skipped.")

    # ── Test 3: Fallback text-based matching (when success_indicator_id is missing) ──
    comp_matches = [
        {"target_text": "MFO 1 — Target Description 1", "confidence": 0.8, "competency": "Programming"},
    ]
    ratings_by_si = {
        "si-abc": {"quality": 4, "efficiency": 4, "timeliness": 4},
    }
    si_to_composite = {
        "si-abc": "MFO 1 — Target Description 1"
    }
    score = calculate_competency_score(comp_matches, ratings_by_si, si_to_composite)
    assert score == 4.0, f"Test 3 failed: Expected 4.0, got {score}"
    print("✅ Test 3 Passed: Fallback text-based matching resolved correctly.")

    # ── Test 4: Completely unrated competency (should return None/Not Yet Assessed) ──
    comp_matches = [
        {"success_indicator_id": "si-1", "confidence": 0.8, "competency": "Leadership"},
    ]
    ratings_by_si = {} # no ratings at all
    score = calculate_competency_score(comp_matches, ratings_by_si, si_to_composite)
    assert score is None, f"Test 4 failed: Expected None, got {score}"
    print("✅ Test 4 Passed: Unrated competency correctly returns None.")

    print("\n🎉 All aggregation math tests passed successfully!")

if __name__ == "__main__":
    test_aggregation_math()
