# Running QuMail in VS Code

Follow these steps to set up and run the QuMail application on your local machine using VS Code.

## Prerequisites

- **Node.js**: Install Node.js (version 20 or higher recommended).
- **PostgreSQL**: A Neon PostgreSQL connection string (which you already have).

## Setup Steps

1. **Extract the ZIP**: Unzip the downloaded project folder and open it in VS Code.
2. **Install Dependencies**:
   Open the VS Code terminal and run:
   ```bash
   npm install
   ```
3. **Configure Environment Variables**:
   Create a file named `.env` in the root directory of the project and add your Neon connection string:
   ```env
   DATABASE_URL=your_neon_postgresql_link_here
   NODE_ENV=development
   ```
4. **Initialize the Database**:
   Push the schema to your Neon database:
   ```bash
   npm run db:push
   ```
5. **Run the Application**:
   Start the development server:
   ```bash
   npm run dev
   ```

## Accessing the App

Once the server starts, you can access the application at:
`http://localhost:5000`

The backend runs an Express server, and the frontend is served via Vite with Hot Module Replacement enabled.