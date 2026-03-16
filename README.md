# 🏢 מערכת ניהול תפעול שטח

מערכת לניהול לוח זמנים ותכנון ביקורים של מחלקת התפעול.

---

## 🚀 הוראות התקנה מלאות

### שלב 1 – Firebase

1. היכנס ל-[console.firebase.google.com](https://console.firebase.google.com)
2. לחץ **"Add project"** → תן שם (למשל `ops-management`) → המשך
3. בתפריט השמאלי בחר **Firestore Database** → **Create database** → בחר **Production mode** → בחר אזור (`europe-west1` מומלץ לישראל)
4. בתפריט השמאלי בחר **Project Settings** (גלגל השיניים) → לשונית **General** → גלול למטה ל-**Your apps** → לחץ **</>** (Web)
5. תן שם לאפליקציה → לחץ **Register app**
6. **העתק** את ה-`firebaseConfig` – תצטרך אותו בשלב 3

#### כללי אבטחה ל-Firestore:
בתפריט Firestore → **Rules** → החלף הכל ב:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```
לחץ **Publish**.

---

### שלב 2 – GitHub

1. צור חשבון ב-[github.com](https://github.com) אם אין לך
2. לחץ **New repository** → שם: `ops-management` → **Public** → **Create**
3. העלה את כל הקבצים של הפרויקט לריפוזיטורי

---

### שלב 3 – Vercel

1. היכנס ל-[vercel.com](https://vercel.com) עם חשבון GitHub
2. לחץ **New Project** → בחר את הריפוזיטורי `ops-management`
3. Framework Preset: **Vite** (Vercel מזהה אוטומטית)
4. לפני הלחיצה על Deploy, לחץ על **Environment Variables** והוסף:

| שם | ערך (מה-firebaseConfig שהעתקת) |
|---|---|
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

5. לחץ **Deploy** ✅

---

## 📋 מבנה הקבצים

```
ops-management/
├── src/
│   ├── App.jsx          ← כל הלוגיקה והקומפוננטות
│   ├── index.css        ← כל העיצוב
│   └── main.jsx         ← נקודת כניסה
├── index.html
├── package.json
├── vite.config.js
└── .env.example         ← העתק ל-.env.local למפתחות Firebase
```

---

## 🗂️ אוספים ב-Firestore (נוצרים אוטומטית)

| אוסף | תוכן |
|---|---|
| `workers` | אנשי שטח |
| `visits` | כל הביקורים (מתוכנן + בפועל) |
| `visitTypes` | מהות ביקור |
| `cities` | ערים |
| `malls` | קניונים + שיוך לעיר |
| `branches` | סניפים + שיוך לקניון |
| `clockEvents` | רישום כניסה/יציאה |

---

## 🛠️ פיתוח מקומי

```bash
npm install
cp .env.example .env.local
# מלא את הערכים ב-.env.local
npm run dev
```
