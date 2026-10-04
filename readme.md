# Frontend - React + Vite

This directory contains the frontend application built using **React** and **Vite** for a fast development experience and optimized production build.

## Prerequisites

Make sure you have **Node.js** (LTS version recommended) installed on your system. You can verify your installation by running:
```bash
node -v
npm -v
```

## Getting Started

1. **Navigate to the frontend directory** (if you aren't already there):
   ```bash
   cd frontend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run the development server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser to view the application.

## Available Scripts

In the project directory, you can run:

* `npm run dev`: Starts the local development server with Hot Module Replacement (HMR).
* `npm run build`: Bundles the application for production into the `dist` folder.
* `npm run lint`: Runs ESLint to check for code quality and syntax issues.
* `npm run preview`: Locally previews the production build.

## Project Structure

```text
frontend/
├── public/           # Static assets
├── src/              # Source code components and assets
│   ├── App.jsx       # Root component
│   └── main.jsx      # Application entry point
├── index.html        # HTML template
├── package.json      # Dependencies and scripts
└── vite.config.js    # Vite configuration