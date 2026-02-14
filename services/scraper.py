import requests
import yt_dlp
from bs4 import BeautifulSoup


def extract_text_from_url(url):
    """Extracts visible text content from a web page."""
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        res = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')
        for s in soup(["script", "style", "nav", "footer", "header"]):
            s.decompose()
        return ' '.join(soup.get_text().split())
    except Exception:
        return None


def get_web_metadata(url):
    """Extracts title and main image from a website (Open Graph)."""
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        res = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(res.text, 'html.parser')

        og_title = soup.find("meta", property="og:title")
        title = og_title["content"] if og_title else (soup.find("title").get_text() if soup.find("title") else "")

        og_image = soup.find("meta", property="og:image")
        image = og_image["content"] if og_image else ""

        return {"title": title.strip(), "image": image}
    except Exception as e:
        print(f"Metadata extraction error: {e}")
        return {"title": "", "image": ""}


def get_final_maps_url(url):
    """Follows redirects to get the final Google Maps URL."""
    try:
        return requests.get(url, allow_redirects=True, timeout=10).url
    except Exception:
        return url


def download_video(url, file_name):
    """Downloads a video using yt-dlp."""
    ydl_opts = {
        'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
        'outtmpl': file_name + '.mp4',
        'quiet': True
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        ydl.download([url])
    return file_name + ".mp4"
