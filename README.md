# Vasuki NFC V4 Production

## Upload
Upload all files/folders inside this folder to GitHub repo root.

## Login
Admin Login: `admin` / `admin123`

## Firebase
This build uses Firebase Realtime Database only.
Project connected: `vasuki-nfc-291d3`

## Realtime Database test rules
For testing only:
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

## Flow
1. Open `admin-login.html`
2. Login with admin/admin123
3. Add customer
4. Open customer login
5. Customer edits card
6. Public card opens at `card/?u=username`

## Plan settings
Admin > Plan Settings can change price from ₹499 to any future price.
