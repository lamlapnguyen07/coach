# 嘴砲教練

飲食、運動、喝水、體重紀錄。沒做到就罵你，還會推播到手機罵。

## 上線步驟（約 10 分鐘）

### 一、放到 GitHub

1. 註冊並登入 GitHub。
2. 右上角「＋」→ New repository。名稱隨意（例如 `coach`），選 **Public**，按 Create。
3. 在新專案頁面點「uploading an existing file」，把這個資料夾**裡面的所有東西**（包含 `.github` 和 `scripts` 資料夾）拖進去，按 Commit changes。
   - 如果 `.github` 資料夾沒有被上傳（Windows 檔案總管有時會略過），就在專案頁按 Add file → Create new file，檔名輸入 `.github/workflows/nag.yml`，把同名檔案的內容貼進去再 Commit。
4. Settings → Pages → Branch 選 `main`、資料夾選 `/ (root)` → Save。
5. 等一兩分鐘，網址會是 `https://你的帳號.github.io/coach/`。

### 二、裝到 iPhone

1. 用 **Safari** 打開上面的網址。
2. 分享按鈕 → 加入主畫面。
3. 之後一律從主畫面的圖示打開。
4. 到「設定」填身高、體重、年齡、目標、運動日，按儲存。

### 三、開推播

1. 在 App 的「設定 → 推播罵人」按「開啟推播」，允許通知。
2. 按「複製」複製出現的那一整段設定。
3. 到 GitHub 專案 → Settings → Secrets and variables → Actions → New repository secret。
   Name 填 `PUSH_CONFIG`，Secret 貼上剛剛複製的內容，按 Add secret。
4. 到 Actions 分頁（第一次要按同意啟用）→ 左邊選 nag → Run workflow。幾十秒後手機應該收到通知。

之後每天台灣時間 13:00、19:00、21:30 會自動推播。要改時間就編輯 `.github/workflows/nag.yml` 裡的 cron（用 UTC，台灣時間減 8 小時）。

## 要知道的限制

- 資料只存在這支手機。換手機或刪除 App 前，到設定頁「匯出備份」。
- GitHub 的排程常常晚 5 到 30 分鐘，不是準點。
- 專案如果連續 60 天沒有任何更新，GitHub 會自動停用排程並寄信通知。到 Actions 頁按一下 Enable 就恢復。
- 如果推播突然不來了，在 App 設定頁按「重新產生推播設定」，再把新的內容更新到 `PUSH_CONFIG`。
- 食物熱量與運動消耗都是概估，重點是每天用同一套標準看趨勢。
