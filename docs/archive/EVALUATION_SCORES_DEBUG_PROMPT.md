# COMPREHENSIVE DEBUGGING PROMPT: Evaluation Scores Not Appearing in Admin Assessment Forms

## UPDATE: ROOT CAUSE FOUND & FIXED (April 29, 2026)

**CRITICAL BUG IDENTIFIED**: Field name collision in database
- Database column `personality_score` stores BOTH PCPT sum (6-30) AND oral score (1-5)
- When admin reads value in 1-5 range, it tries to convert as PCPT → returns 0 → shows N/A

**FIXES IMPLEMENTED**:
1. ✅ Smart scale detection added to RSPDashboard.tsx (~line 4757)
2. ✅ Debug logging added for troubleshooting
3. ✅ Converts 1-5 scores to PCPT-equivalent automatically

**Test Status**: Ready for testing - open Assessment Forms, check console logs

---

# [ORIGINAL DEBUGGING GUIDE BELOW]

## THE PROBLEM
- ✅ Interviewer submits evaluation (status shows "Completed")
- ✅ Form submits successfully to database
- ❌ Admin assessment forms show 0.00 or N/A for most scores
- ⚠️ Only partial data appears (e.g., Written Exam shows 20.00, but PCPT/Oral show N/A)

## CRITICAL: Show Me All Logs At Each Step

Please add comprehensive console.log statements at EVERY step of the data flow and show me the output:

---

## STEP 1: VERIFY DATA SAVED TO SUPABASE

**What to Check**: 
- Open browser DevTools → Network tab
- Go to Interviewer → Select applicant → Submit evaluation form
- Find the POST request to `/api/evaluations/`
- Show me:
  1. The request body (what data is being sent?)
  2. The response status (201? 500? 400?)
  3. The response body (does it show the saved record?)

**Questions to Answer**:
- What fields are actually being sent to the database?
- Does the request include: `personality_score`, `communication_skills_score`, `confidence_score`, etc.?
- What are their VALUES (e.g., personality_score: 18, or personality_score: null)?

**Paste the exact network request/response here**:
```
[PASTE NETWORK TAB OUTPUT]
```

---

## STEP 2: VERIFY DATA EXISTS IN DATABASE

**What to Check**:
Open Supabase Studio → evaluations table → Find the row for "John Maria Cena"

**Questions to Answer**:
- Does the row exist?
- What are the actual column values?
  - `applicant_id`: ? 
  - `personality_score`: ?
  - `communication_skills_score`: ?
  - `confidence_score`: ?
  - `comprehension_score`: ?
  - `job_knowledge_score`: ?
  - `overall_impression_score`: ?
  - `interview_notes`: ?
  - `recommendation`: ?

**Paste the full row data here**:
```
{
  "id": ?,
  "applicant_id": ?,
  "personality_score": ?,
  "communication_skills_score": ?,
  "confidence_score": ?,
  "comprehension_score": ?,
  "job_knowledge_score": ?,
  "overall_impression_score": ?,
  "interview_notes": ?,
  "recommendation": ?
}
```

---

## STEP 3: CHECK IF DATA IS FETCHING FROM DATABASE

**Add This Debug Code** to `src/modules/admin/RSPDashboard.tsx` at line 890 (in the load() function):

```typescript
// Add after evaluationsRes is fetched
if (evaluationsRes.status === 'fulfilled' && Array.isArray(evaluationsRes.value.data)) {
  console.log('[DEBUG] === EVALUATIONS FETCHED FROM DB ===');
  console.log('[DEBUG] Total evaluations:', evaluationsRes.value.data.length);
  
  evaluationsRes.value.data.forEach((eval: any) => {
    console.log('[DEBUG] Evaluation record:', {
      applicant_id: eval.applicant_id,
      personality_score: eval.personality_score,
      communication_skills_score: eval.communication_skills_score,
      confidence_score: eval.confidence_score,
      comprehension_score: eval.comprehension_score,
      job_knowledge_score: eval.job_knowledge_score,
      overall_impression_score: eval.overall_impression_score,
      interview_notes: eval.interview_notes,
      recommendation: eval.recommendation,
    });
  });
}
```

**Run it and show me**:
- The console.log output showing what evaluations were fetched
- For "John Maria Cena", what are all the score values?

**Paste console output here**:
```
[PASTE CONSOLE OUTPUT]
```

---

## STEP 4: CHECK IF EVALUATIONS ARE STORED IN WINDOW MAP

**Add This Debug Code** to `src/modules/admin/RSPDashboard.tsx` at line 978 (after evaluationsByApplicantId is set):

```typescript
// Add after: (window as any).__evaluationsByApplicantId = evaluationsByApplicantId;
console.log('[DEBUG] === EVALUATIONS MAP (window.__evaluationsByApplicantId) ===');
console.log('[DEBUG] Map size:', evaluationsByApplicantId.size);
evaluationsByApplicantId.forEach((eval: any, applicantId: string) => {
  console.log(`[DEBUG] ${applicantId}:`, {
    personality_score: eval.personality_score,
    communication_skills_score: eval.communication_skills_score,
    confidence_score: eval.confidence_score,
    comprehension_score: eval.comprehension_score,
    job_knowledge_score: eval.job_knowledge_score,
    overall_impression_score: eval.overall_impression_score,
  });
});
```

**Run it and show me**:
- How many evaluations in the map?
- For John Maria Cena's applicant ID, what scores are stored?

**Paste console output here**:
```
[PASTE CONSOLE OUTPUT]
```

---

## STEP 5: CHECK IF SCORES ARE RESOLVED IN ASSESSMENT FORM

**Add This Debug Code** to `src/modules/admin/RSPDashboard.tsx` at line 4618 (in the evalRow resolution):

```typescript
// Replace the evalRow definition with this debug version:
const evalRow = (() => {
  const map = (window as any).__evaluationsByApplicantId;
  console.log('[EVAL RESOLUTION] Looking for applicant:', {
    id: applicant.id,
    name: applicant.full_name,
    email: applicant.email,
    map_exists: !!map,
    map_size: map ? map.size : 0
  });

  if (!map || typeof map.get !== 'function') {
    console.log('[EVAL RESOLUTION] ✗ No eval map');
    return null;
  }

  let result = map.get(String(applicant.id).trim()) ?? null;
  if (result) {
    console.log('[EVAL RESOLUTION] ✓ Found eval by direct ID:', {
      personality_score: result.personality_score,
      communication_skills_score: result.communication_skills_score,
      confidence_score: result.confidence_score,
    });
    return result;
  }

  console.log('[EVAL RESOLUTION] ✗ No eval found');
  return null;
})() as any;
```

**Run it and show me**:
- For John Maria Cena, what does the resolution log show?
- Does it find the evaluation or not?

**Paste console output here**:
```
[PASTE CONSOLE OUTPUT]
```

---

## STEP 6: CHECK SCORE CONVERSION LOGIC

**Add This Debug Code** to `src/modules/admin/RSPDashboard.tsx` at line 4710 (where scores are calculated):

```typescript
// Add after pcptScore is calculated
console.log('[SCORE CONVERSION] For applicant:', applicant.full_name);
console.log('[SCORE CONVERSION] === RAW SCORES FROM DATABASE ===');
console.log('[SCORE CONVERSION] educationRaw:', educationRaw);
console.log('[SCORE CONVERSION] experienceRaw:', experienceRaw);
console.log('[SCORE CONVERSION] oralRaw:', oralRaw);
console.log('[SCORE CONVERSION] pcptRaw:', pcptRaw);
console.log('[SCORE CONVERSION] === CONVERTED SCORES ===');
console.log('[SCORE CONVERSION] educationScore:', educationScore);
console.log('[SCORE CONVERSION] experienceScore:', experienceScore);
console.log('[SCORE CONVERSION] oralExamScore:', oralExamScore);
console.log('[SCORE CONVERSION] pcptScore:', pcptScore);
console.log('[SCORE CONVERSION] totalScore:', totalScore);
```

**Run it and show me**:
- What are the raw scores from database?
- What are the converted scores?
- Which ones are 0? Which are null?

**Paste console output here**:
```
[PASTE CONSOLE OUTPUT]
```

---

## STEP 7: VERIFY RESOLVEscorevalue FUNCTION

**What to Check**:
Search for `resolveScoreValue` function in RSPDashboard.tsx

**Questions to Answer**:
- What does the function do?
- What input does it receive from `stored`?
- What output does it return?
- Is it handling the evaluation data correctly?

**Show me the function code**:
```typescript
[PASTE resolveScoreValue FUNCTION]
```

---

## STEP 8: CHECK DATA TYPE MISMATCHES

**Critical Question**: 
When the evaluation is stored in the database and then fetched back:
- Are numeric scores being returned as numbers?
- Or are they being returned as strings?
- Or are they null/undefined?

**Example of the Problem**:
```javascript
// If database returns:
{ personality_score: "18" }  // STRING, not number!
// Then this fails:
typeof pcptRaw === 'number' && pcptRaw > 0  // FALSE because it's a string!
```

**Add This Debug Code** to see data types:

```typescript
console.log('[TYPE CHECK] personality_score type:', typeof evalRow?.personality_score, 'value:', evalRow?.personality_score);
console.log('[TYPE CHECK] communication_skills_score type:', typeof evalRow?.communication_skills_score, 'value:', evalRow?.communication_skills_score);
console.log('[TYPE CHECK] confidence_score type:', typeof evalRow?.confidence_score, 'value:', evalRow?.confidence_score);
```

**Paste console output here**:
```
[PASTE CONSOLE OUTPUT]
```

---

## STEP 9: TRACE THE COMPLETE FLOW

**Create a test case**:
1. Open browser DevTools → Console
2. Go to Interviewer platform
3. Submit an evaluation for "John Maria Cena"
4. WAIT 2 seconds
5. Go to Admin → RSP → Reports → Assessment Forms → Legal → Select "Admin Officer II"
6. In the browser console, you should see all the debug logs from steps 3-7

**Paste ALL console logs in chronological order**:
```
[PASTE ALL CONSOLE OUTPUT FROM ONE COMPLETE FLOW]
```

---

## WHAT TO LOOK FOR

Based on your logs, the problem is likely ONE of these:

### Issue A: Data Not Saved
- Network response shows 500 error or missing fields
- Database shows NULL values
- **Solution**: Fix EvaluationForm.tsx to send correct data

### Issue B: Data Not Fetching
- evaluationsRes shows 0 records
- Map shows size: 0
- **Solution**: Check database permissions or Supabase connection

### Issue C: Data Not Matching
- Map has data but evalRow is null
- Applicant IDs don't match between table and evaluation record
- **Solution**: Fix ID matching logic in RSPDashboard

### Issue D: Data Type Mismatch
- personality_score returns as string "18" instead of number 18
- typeof checks fail because of type mismatch
- **Solution**: Parse numbers in the conversion function

### Issue E: Data Transformation Loss
- rawScore is correct but converted score is 0
- resolveScoreValue() returns 0
- **Solution**: Check conversion math in score calculation

---

## FINAL OUTPUT REQUIRED

When you've collected all this data, provide:

1. **Network Tab Screenshot**: Show the POST request for evaluation submission
2. **Supabase Screenshot**: Show the evaluation row in the database table
3. **Console Logs**: Full output from all 9 steps
4. **Expected vs Actual**: 
   - What should personality_score be? (currently in DB)
   - What is it showing in assessment form?
5. **Applicant ID**: What is John Maria Cena's actual ID?

With this data, Claude Opus will be able to pinpoint the EXACT location where the data is getting lost and provide the specific code fix needed.
