
import pandas as pd

REQUIRED_COLUMNS = {
    "Reference Handle", "Token", "Item Name", "Variation Name", "SKU", "Description",
    "Categories", "Reporting Category", "SEO Title", "SEO Description",
    "Item Type", "Sold Online", "Available for Sale", "Square Online Item Visibility"
}

REQUIRED_VALUES = {
    "Square Online Item Visibility": "Visible",
    "Sold Online": "Y",
    "Available for Sale": "Y",
    "Item Type": "Physical"
}

def validate_values(file_path):
    print(f"📄 Validating import file: {file_path}")
    df = pd.read_excel(file_path)
    errors = []

    # Check headers
    missing_headers = REQUIRED_COLUMNS - set(df.columns)
    if missing_headers:
        errors.append(f"❌ Missing headers: {sorted(missing_headers)}")

    # Check values
    for field, expected in REQUIRED_VALUES.items():
        if field in df.columns:
            values = df[field].dropna().astype(str).str.strip().unique()
            if expected not in values:
                errors.append(f"❌ Expected '{expected}' in '{field}', found {list(values)}")
        else:
            errors.append(f"❌ Missing expected column '{field}'")

    if errors:
        print("\n".join(errors))
    else:
        print("✅ All required fields and values are correct.")

if __name__ == "__main__":
    validate_values("your_square_file.xlsx")
