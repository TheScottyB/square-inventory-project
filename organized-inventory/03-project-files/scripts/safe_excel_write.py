
import pandas as pd

def safe_excel_write(df, file_path):
    '''
    Writes a DataFrame to Excel with headers cleaned, NaNs removed, and everything as strings.
    Prevents common pandas-related issues with Square/Shopify import templates.
    '''

    # Clean column headers
    df.columns = df.columns.astype(str).str.strip()

    # Strip whitespace, replace NaNs, and force everything to string
    df_clean = df.fillna("").astype(str)
    df_clean = df_clean.applymap(lambda x: x.strip() if isinstance(x, str) else x)

    # Drop unnamed or duplicate index columns, if present
    if "Unnamed: 0" in df_clean.columns:
        df_clean.drop(columns=["Unnamed: 0"], inplace=True)

    # Ensure no duplicate columns
    df_clean = df_clean.loc[:, ~df_clean.columns.duplicated()]

    # Export cleanly
    df_clean.to_excel(file_path, index=False)

    print(f"✅ Safe export complete: {file_path}")
