import sys
import requests
from urllib.parse import urlsplit

def unshorten_url(short_url):
    try:
        response = requests.head(short_url, allow_redirects=True)
        return response.url
    except requests.exceptions.RequestException:
        return None

if __name__ == "__main__":
    short_url = sys.argv[1]
    long_url = unshorten_url(short_url)
    domain = urlsplit(long_url).netloc
    
    if long_url:
        print(f"Long URL: {long_url}")
        print(f"Domain: {domain}")
