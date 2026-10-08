#!/usr/bin/env python3
"""Binance TR public API connectivity diagnosis on Termux. No credentials."""
import json
import urllib.request
import urllib.error

URLS = [
    ("Resmi saat", "https://www.binance.tr/open/v1/common/time"),
    ("TRY pariteleri", "https://www.binance.tr/open/v1/common/symbols"),
    ("MAIN piyasa", "https://api.binance.me/api/v1/ping"),
]
for name, url in URLS:
    try:
        request = urllib.request.Request(url, headers={"Accept":"application/json","User-Agent":"TradeRadar-Connectivity-Test/1.0"})
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = response.read(1500000)
            print(f"{name}: HTTP {response.status}")
            if "symbols" in url:
                data = json.loads(payload).get("data", {})
                listing = data.get("list", [])
                matches = [x for x in listing if str(x.get("quoteAsset","")).upper()=="TRY"]
                print(f"  TRY pariteleri: {len(matches)} / Toplam: {len(listing)}")
    except urllib.error.HTTPError as error:
        print(f"{name}: HTTP {error.code} - erisim reddedildi")
    except Exception as error:
        print(f"{name}: BAGLANTI HATASI: {type(error).__name__}: {error}")
print("Test tamamlandi. API anahtari kullanilmadi.")
