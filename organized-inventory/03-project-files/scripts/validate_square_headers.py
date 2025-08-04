
import pandas as pd

# Define required Square fields (adjustable based on actual needs)
REQUIRED_FIELDS = {
    "Reference Handle",
    "Token",
    "Item Name",
    "Variation Name",
    "SKU",
    "Description",
    "Categories",
    "Reporting Category",
    "SEO Title",
    "SEO Description",
    "Item Type",
    "Sold Online",
    "Available for Sale",
    "Square Online Item Visibility"
}

def validate_square_import(file_path):
    print(f"🔍 Validating: {file_path}")
    df = pd.read_excel(file_path)
    headers = list(df.columns)

    # Check for duplicates
    duplicates = set([x for x in headers if headers.count(x) > 1])

    # Check for missing required fields
    missing = REQUIRED_FIELDS - set(headers)

    if duplicates:
        print(f"❌ Duplicate headers found: {sorted(duplicates)}")
    else:
        print("✅ No duplicate headers found.")

    if missing:
        print(f"❌ Missing required headers: {sorted(missing)}")
    else:
        print("✅ All required headers are present.")

    print("✅ Header check complete.")

# Example usage
if __name__ == "__main__":
    validate_square_import("your_square_import_file.xlsx")
