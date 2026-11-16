# 帝皇禁軍軍表

在「軍表 → 雲端軍表」使用 Google 帳號登入，選取本機軍表後按「儲存到雲端」。在另一台裝置登入同一帳號，按「載入到本機」即可繼續編輯。每份軍表有一個雲端存檔，重新儲存會更新該存檔。遊玩進度、分數覆寫和偏好設定保存在各裝置上。

## 本機測試

從專案根目錄執行下列指令啟動網站。

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

在另一個終端機啟動 Firebase Authentication 和 Firestore 模擬器（需要 Firebase CLI 和 Java 21 以上）。

```sh
firebase emulators:start --only auth,firestore --project demo-wh-ac
```

開啟 [本機雲端軍表](http://127.0.0.1:8000/?emulators#/cloud)。選擇 Google 登入後，可在模擬器建立測試帳號。用另一個瀏覽器的同一測試帳號可驗證跨裝置載入。

## 正式環境

網站由 GitHub Pages 提供。Firebase 專案為 `wh-ac-rosters-1121`，網頁應用程式設定位於 `js/firebase-config.js`。軍表存放在 Firestore 的 `users/{uid}/rosters/{listId}`。更新 `firestore.rules` 後，在專案根目錄部署規則。

```sh
firebase deploy --only firestore:rules --project wh-ac-rosters-1121
```

若更換網站網域，請將新網域加入 Firebase Authentication 的「設定 → 授權網域」。
