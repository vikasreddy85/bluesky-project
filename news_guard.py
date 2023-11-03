import sys
import requests
import pandas as pd
from urllib.parse import urlparse, urlsplit
import math

df = pd.read_csv("./NewsGuard/metadata.csv")
df_all = pd.read_csv("./NewsGuard/all-sources-metadata.csv", dtype={'Designated Market Area': str})

common_columns = df_all.columns.intersection(df.columns)
rows_to_append = df[~df['Domain'].isin(df_all['Domain'])]
df_all = pd.concat([df_all, rows_to_append[common_columns]], ignore_index=True)

def process_url(short_url):
    def unshorten_url(short_url):
        try:
            response = requests.head(short_url, allow_redirects=True)
            return response.url
        except requests.exceptions.RequestException:
            return None

    long_url = unshorten_url(short_url)
    parsed_url = urlparse(long_url)
    
    # Use urlsplit to extract the domain
    split_url = urlsplit(long_url)
    domain = split_url.netloc
    
    score = None

    try:
        # Check if the domain is in df_all['Domain'] and get the score
        domain_found = domain in df_all['Domain'].values
        if domain_found:
            score = df_all[df_all['Domain'] == domain]['Score'].values[0]
        else:
            # Check if the source is contained in the long URL and get the score
            for source, source_score in zip(df_all['Source'], df_all['Score']):
                if isinstance(source, str) and source is not None and source.lower() in long_url.lower():
                    score = source_score
                    break
    except AttributeError:
        pass

    # Check if the score is NaN and provide an explanation
    if not (isinstance(score, float) and math.isnan(score)):
        print(f" {score}")

if __name__ == "__main__":
    # Get the URL from the command line argument
    if len(sys.argv) != 2:
        print("Usage: python process_url.py <short_url>")
        sys.exit(1)

    short_url = sys.argv[1]
    process_url(short_url)