# Contributing to Budget Tracker

Thank you for your interest in contributing to Budget Tracker! We welcome contributions from the community to make this project better for everyone.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/YOUR_USERNAME/budget-tracker.git
    cd budget-tracker
    ```
3.  **Create a new branch** for your feature or bug fix:
    ```bash
    git checkout -b feature/amazing-feature
    ```

## Development Setup

The project uses Docker Compose for a consistent development environment.

1.  **Copy the environment file:**
    ```bash
    cp .env.example .env
    ```
2.  **Start the application:**
    ```bash
    docker compose up --build
    ```
    - Frontend: http://localhost:3456
    - Backend API: http://localhost:5050
    - Database: localhost:5433

## Project Structure

-   `backend/`: Express + TypeScript API
-   `frontend/`: React + Vite + Tailwind CSS
-   `database/`: SQL migration scripts

## Making Changes

1.  **Code Style:**
    -   Backend: Follow TypeScript best practices.
    -   Frontend: Functional React components with Hooks.
    -   Styling: Tailwind CSS utility classes.

2.  **Database Changes:**
    -   If you modify the schema, create a new `.sql` file in `database/` named descriptively (e.g., `add_new_feature.sql`).
    -   Do not modify `init.sql` for existing migrations.

3.  **Testing:**
    -   Ensure your changes don't break existing functionality.
    -   Run backend tests (if applicable): `cd backend && npm test`.

## Submitting a Pull Request

1.  **Push your branch** to your fork:
    ```bash
    git push origin feature/amazing-feature
    ```
2.  **Open a Pull Request** on the main repository.
3.  **Describe your changes** clearly in the PR description. Link to any related issues.

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## License

By contributing, you agree that your contributions will be licensed under its MIT License.
