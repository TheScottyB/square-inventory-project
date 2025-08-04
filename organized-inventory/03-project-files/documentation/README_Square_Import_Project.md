
# 🧾 Square Import Project README

Welcome aboard the TRTR & DrDZB inventory launch system. This repo is structured to maintain and manage Square Online product data safely, scalably, and with spiritual precision.

---

## 📦 What’s In This Folder

### ✅ [Square_Import_Template_MINIMAL_SAFE.xlsx](Square_Import_Template_MINIMAL_SAFE.xlsx)
- Contains the minimum viable structure for successful item imports to Square Online.
- All required fields are filled:
  - `Reference Handle`, `Token`, `Item Name`, `Description`, `SKU`, etc.
  - `Square Online Item Visibility = Visible`
  - `Sold Online = Y`, `Available for Sale = Y`, `Item Type = Physical`

### 🧪 [square_import_value_validator.py](square_import_value_validator.py)
- A Python script to validate import files before uploading to Square.
- It checks:
  - Missing required headers
  - Invalid values in critical fields
  - Duplicate column issues

### 📄 [Proposed_Store_Categories_TRTR_DrDZB.docx](Proposed_Store_Categories_TRTR_DrDZB.docx)
- Finalized, tone-appropriate store categories (e.g., *Mind & Clarity*, *Energy & Elements*, *DrDZB’s Picks*).
- Use for tagging and navigation UX.

### 📘 [Modern Apothecary Meets General Store.pdf](Modern Apothecary Meets General Store.pdf)
- Case studies and research support behind the store’s concept, tone, and positioning.

---

## 🛠 How to Use This System

1. **Edit your product rows** using the provided Excel import template.
2. **Run the validator**:
   ```bash
   python square_import_value_validator.py
   ```
   This will alert you to missing fields or invalid values before you hit Square with it.

3. **Import to Square** via Dashboard → Items → Import → Use This Template.
4. **Celebrate.**

---

## 🤖 Batch Processing Strategy (Optional)

For bulk updates:
- Apply the `MINIMAL_SAFE` column structure
- Use Python/pandas to auto-populate consistent fields
- Generate SEO-friendly titles and descriptions programmatically

---

## ✨ Reminders

- Never remove the `Token` unless you want to create a new item (and break inventory sync).
- Only use location headers (like `Enabled TVM McHenry`) if they exactly match what's in Square.
- When in doubt: strip it down to the working template and rebuild clean.

---

See you on the inventory front. 🏴‍☠️
