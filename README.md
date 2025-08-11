# 🌦 Weather App with CRUD & Forecast

A full-stack weather application that lets users:

- Search for current weather + 5-day forecast by city, zip/postal, landmark, or coordinates
- Detect weather using the browser's current location (GPS)
- Save **date-range temperature records** to a database (SQLite)
- View, update, and delete saved records (CRUD)
- Export all saved records to CSV

Backend is built with **Node.js + Express + SQLite**.  
Frontend is vanilla **HTML/CSS/JS** — no frameworks.

---

## ✨ Features

### Weather Search
- Input formats supported:
  - City (`Paris` or `Paris, FR`)
  - Zip/Postal code (`10001, US`)
  - Landmark (`Eiffel Tower`)
  - Coordinates (`40.7128,-74.0060`)
- Current weather with details (temperature, feels like, humidity, wind, sunrise/sunset)
- 5-day forecast with icons

### CRUD (SQLite Persistence)
- **Create**: Save a location with a start & end date → stores daily min/max/mean temps for that range
- **Read**: View saved records and expand to see daily data
- **Update**: Edit location, dates, or units; auto-fetches updated temps
- **Delete**: Remove saved records
- **Export**: Download all records as CSV

---

## 🗂 Project Structure

weather-app/
├── index.html # Frontend HTML
├── style.css # Frontend styles
├── app.js # Frontend logic
├── server/ # Backend
│ ├── server.js # Express server + SQLite + APIs
│ ├── package.json # Backend dependencies
│ └── .env # API keys & config
└── README.md # You're reading this

---

## 🔑 Prerequisites

- [Node.js](https://nodejs.org/) (v18+ recommended)
- [npm](https://www.npmjs.com/) (comes with Node)
- An [OpenWeather API key](https://openweathermap.org/api) (free)

---

## ⚙️ Setup

### 1. Clone the repo
```bash
git clone https://github.com/yourusername/weather-app.git
cd weather-app



### 2. Backend setup
cd server
npm install
Create a .env file inside the server/ folder:
OPENWEATHER_API_KEY=YOUR_OPENWEATHER_KEY
PORT=5173
Tip: Use require('dotenv').config({ override: true }); in server.js to ensure .env values override shell vars.
Start the backend:
npm start
It should print:
API server running on http://localhost:5173



### 3. Frontend setup
From the project root (weather-app/):
npx serve -p 8000
Open:
http://localhost:8000
🚀 Usage
Search weather
Enter a location → choose °C or °F → click Search
Or click Use My Location to use GPS
Save a date range
Fill in the Save a date-range section with location + start & end dates
Click Save to DB
View records
Scroll to the table, click View to expand daily temps
Edit / Delete
Use Edit to update a record, Delete to remove it
Export
Click Export CSV to download all records
