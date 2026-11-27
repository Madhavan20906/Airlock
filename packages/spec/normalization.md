# Tandem Guard: multi-script and Indic normalisation

## 1. Goal
Adversarial evasion and natural Indian document workflows frequently mix scripts, use vernacular numerals, zero-width characters, or non-standard spacing (e.g. Devanagari `५०१०` or zero-width joiners `U+200D` inside an Aadhaar number).

Tandem Guard enforces a strict **Pre-Detection Normalization Pipeline** before any regex or NER pass executes:

```
Raw Input -> Strip Zero-Width & BOM -> Unicode NFKC Normalization -> Indic Digit Normalization -> Whitespace Normalization -> Layer A & B Detectors
```

## 2. Normalization Steps

### Step 1: Strip Invisible & Adversarial Evasion Characters
Remove all invisible zero-width characters and directional formatting marks that split tokens without visual distinction:
- Zero-Width Space (`\u200B`)
- Zero-Width Non-Joiner (`\u200C`)
- Zero-Width Joiner (`\u200D`)
- Byte Order Mark (`\uFEFF`)
- Left-to-Right / Right-to-Left Marks (`\u200E`, `\u200F`, `\u202A`-\`\u202E\`)

### Step 2: Unicode NFKC Canonical Normalization
Apply `String.prototype.normalize('NFKC')` to:
- Normalize full-width ASCII characters (e.g. `ＡＢＣ` -> `ABC`)
- Normalize ligature glyphs and superscript/subscript numerals to canonical ASCII representations

### Step 3: Indic Numerals to ASCII Normalization
Map all vernacular Indic digit unicode blocks to standard ASCII digits `0-9`:

| Script | Unicode Range | Digits 0 - 9 | ASCII Mapping |
| :--- | :--- | :--- | :--- |
| **Devanagari (Hindi/Marathi)** | `\u0966` - `\u096F` | ० १ २ ३ ४ ५ ६ ७ ८ ९ | `0` - `9` |
| **Bengali / Assamese** | `\u09E6` - `\u09EF` | ০ ১ ২ ৩ ৪ ৫ ৬ ৭ ৮ ৯ | `0` - `9` |
| **Gurmukhi (Punjabi)** | `\u0A66` - `\u0A6F` | ੦ ੧ ੨ ੩ ੪ ੫ ੬ ੭ ੮ ੯ | `0` - `9` |
| **Gujarati** | `\u0AE6` - `\u0AEF` | ૦ ૧ ૨ ૩ ૪ ૫ ૬ ૭ ૮ ૯ | `0` - `9` |
| **Odia** | `\u0B66` - `\u0B6F` | ୦ ୧ ୨ ୩ ୪ ୫ ୬ ୭ ୮ ୯ | `0` - `9` |
| **Tamil** | `\u0BE6` - `\u0BEF` | ௧ ௨ ௩ ௪ ௫ ௬ ௭ ௮ ௯ | `0` - `9` |
| **Telugu** | `\u0C66` - `\u0C6F` | dev ౧ ౨ ౩ ౪ ౫ ౬ ౭ ౮ ౯ | `0` - `9` |
| **Kannada** | `\u0CE6` - `\u0CEF` | ೦ ೧ ೨ ೩ ೪ ೫ ೬ ೭ ೮ ೯ | `0` - `9` |
| **Malayalam** | `\u0D66` - `\u0D6F` | ൦ ൧ ൨ ൩ ൪ ൫ ൬ ൭ ൮ ൯ | `0` - `9` |

### Step 4: Delimiter Unification for Structured Identifiers
Before running checksum validations (such as Verhoeff for Aadhaar and regex for PAN):
- Collapse continuous whitespace or hyphens between 4-digit groups in Aadhaar (`1234 5678 9012` -> `123456789012`)
- Preserve offset mapping so redactions accurately span the original text indices.
