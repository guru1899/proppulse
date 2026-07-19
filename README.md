# PropPulse

A local, responsive prop-firm futures account tracker.

## Run it

```powershell
node server.js
```

Then open `http://127.0.0.1:4174`.

The app saves its data in the local SQLite database file `proppulse.db`. Keep this file alongside the app to preserve your data across restarts.

## Daily balance CSV

Select the trading date in the app, then import a CSV containing exactly these columns:

```csv
account_id,balance
LT-25K-7481,24444.00
FN-50K-5623,49620.50
```

The same account and selected date is updated rather than duplicated. Data is saved privately in the browser on this device.
