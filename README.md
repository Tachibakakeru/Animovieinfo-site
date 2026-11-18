# 映藍 ANIMOVIE

查詢臺灣電影院正在上映與即將上映的動畫電影，從海報打開作品介紹，再依日期、時段、縣市、放映規格或品牌篩選放映場次。

**[開啟映藍網站](https://tachibakakeru.github.io/Animovieinfo-site/)**

首頁翻頁鐘與上映倒數共用台北時間。只有上映日期的作品，以當天零點為倒數目標；實際開演時間請查場次表。頁尾可選擇完整動畫或跟隨系統偏好。

## 資料與更新

- 直接讀取 [國賓](https://www.ambassador.com.tw/)、[喜樂時代](https://ticket.centuryasia.com.tw/)、[秀泰影城](https://www.showtimes.com.tw/programs/) 與 [親親影城](https://www.ccmovie.com.tw/) 的公開片目及場次。
- 新光與美麗新依影片、分店、日期與開演時間匯入官方公開場次及版本。僅保留已確認為動畫的作品。 [新光影城官網](https://www.skcinemas.com/Sessions/Sessions?cinemaId=1002) · [美麗新影城官網](https://www.miranewcinemas.com/Booking/Timetable)
- 威秀、MUVIE 和新光的補充場次取自開眼所列的分店與日期。威秀 2026/11/20–24 另補本期從官網確認的三家柯南場次。每筆場次附來源，規格尚待確認時會標示「規格待核對」。 [開眼電影網](https://www.atmovies.com.tw/showtime/) · [威秀官方電影頁](https://www.vscinemas.com.tw/VsWeb/film/detail.aspx?id=9075)
- 片單、部分場次及影城位置參考原始專案。 [動畫電影上映地圖](https://dandadany.github.io/anime_movie_screening/)
- GitHub Actions 每三小時的第 17 分排定擷取及部署。實際執行可能延後。首頁和場次地圖都顯示資料擷取時間，更新失敗時保留前次部署。

## 本機執行

需要 Python 3.10 以上。在專案根目錄執行下列指令。既有快照可直接用預覽指令開啟。

```sh
python -m pip install beautifulsoup4
python scripts/update_data.py
python scripts/preview.py
```

開啟 http://127.0.0.1:18764/ 。網站入口為 `site/index.html`，片單與地圖共用 `site/data.json`。正式網站由 GitHub Pages 發佈 `site/`。如自行部署，可在 Pages 設定選擇 GitHub Actions，設定儲存庫變數 `PUBLISH_PAGES=true` 後執行工作流程。

## 圖像、地圖與授權

- 電影海報、劇照、作品名稱與商標之相關權利歸各權利人。電影詳情列有電影資料、海報及劇照的出處。公開版從來源網站載入電影圖片，未在本儲存庫散布圖片副本；再次使用請查閱原權利人的授權。影像能否顯示取決於來源站。
- 首頁飛機穿梭雲層的插畫為本專案使用生成式 AI 製作的主視覺。
- 地圖元件 Leaflet 1.9.4 使用 BSD-2-Clause 授權，著作權及完整條款見 [Leaflet LICENSE](site/vendor/leaflet/LICENSE.txt)。
- 地圖資料 © OpenStreetMap contributors，以 ODbL 授權。底圖由 OpenStreetMap 提供，地圖內保留署名。[著作權與授權](https://www.openstreetmap.org/copyright) · [圖磚使用政策](https://operations.osmfoundation.org/policies/tiles/)
- 本網站為獨立整理的電影資訊服務；場次異動及購票以影城最新公告為準。
