
import pandas as pd

def normalize_multi_category_cell(cat):
    if pd.isna(cat) or not isinstance(cat, str):
        return cat

    cat = cat.replace("\\", "").strip()
    parts = [c.strip() for c in cat.split(",") if c.strip()]
    fixed_parts = []

    for p in parts:
        if p == "TRTR Curated":
            fixed_parts.append("The Apothecary Cabinet")
        elif p == "Labz":
            fixed_parts.append("Curated Labz")
        else:
            fixed_parts.append(p)

    return ", ".join(sorted(set(fixed_parts)))

def normalize_categories_column(df, column_name="Categories"):
    df[column_name] = df[column_name].apply(normalize_multi_category_cell)
    return df
