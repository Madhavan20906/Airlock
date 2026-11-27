# Tandem Guard placeholder tokens

## 1. Syntax & Grammar
Redaction replaces detected entities with deterministic, typed token placeholders:

```
[<ENTITY_TYPE>_<INDEX>]
```

Examples:
- `[AADHAAR_1]`, `[AADHAAR_2]`
- `[PAN_1]`, `[PAN_2]`
- `[ACCOUNT_1]`, `[ACCOUNT_2]`
- `[PERSON_1]`, `[PERSON_2]`
- `[PHONE_1]`, `[PHONE_2]`
- `[EMAIL_1]`
- `[UPI_1]`
- `[GSTIN_1]`
- `[CARD_1]`
- `[PASSPORT_1]`, `[VOTER_ID_1]`, `[DL_1]`, `[VEHICLE_1]`
- `[DOB_1]`
- `[MEDICAL_1]`

## 2. Core Rules & Guarantees

1. **Deterministic Indexing (1-Based):**
   - The first unique value of a given entity type receives `_1`, the second receives `_2`.
   - Repeated occurrences of the exact same value within the same document receive the **same** placeholder token to maintain co-reference resolution and context in the downstream LLM.

2. **Preservation of Non-Sensitive Syntax:**
   - Surrounding punctuation, quotes, brackets, and whitespace are preserved strictly.
   - Placeholders are enclosed in square brackets `[` and `]` to deter token fragmentation in BPE/SentencePiece tokenizers.

3. **Rehydration:**
   - Ephemeral memory map `Map<string, string>` holds `placeholder -> originalValue`.
   - The rehydration pass scans the raw cloud LLM response and replaces all `[ENTITY_TYPE_INDEX]` tokens with their original values.
   - Original values never leave local client memory.

4. **Post-Flight Token Auditing & Drift Resistance:**
   - Cloud models occasionally drop or modify placeholders (e.g. `[PAN_1]` -> `PAN 1` or `[PAN_1:`).
   - The rehydrator performs a post-flight audit:
     - Detects all placeholders originally inserted.
     - Reports `restoredCount`, `totalPlaceholders`, and `missingPlaceholders`.
     - Flags warning if any placeholder was omitted or drifted by the model.
