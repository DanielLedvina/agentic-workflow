import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  template: `
    <nav class="navbar">
      <div class="navbar-brand">
        <h1>Agentic Workflow</h1>
      </div>
      <ul class="navbar-menu">
        <li>
          <a routerLink="/create" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            ➕ Create
          </a>
        </li>
        <li>
          <a routerLink="/board" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            📋 In Progress
          </a>
        </li>
        <li>
          <a routerLink="/dashboard" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            ✅ Done
          </a>
        </li>
        <li>
          <a routerLink="/agents" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            🤖 Agents
          </a>
        </li>
        <li>
          <a routerLink="/profile" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            👤 Profile
          </a>
        </li>
      </ul>
    </nav>
  `,
  styles: [`
    .navbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1rem 2rem;
      background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
      color: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      gap: 2rem;
    }

    .navbar-brand h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 600;
    }

    .navbar-menu {
      display: flex;
      list-style: none;
      gap: 0;
      margin: 0;
      padding: 0;
      flex: 1;
      justify-content: center;
    }

    .navbar-menu li {
      margin: 0;
    }

    .navbar-menu a {
      display: block;
      padding: 0.75rem 1.25rem;
      color: rgba(255, 255, 255, 0.8);
      text-decoration: none;
      transition: all 0.2s;
      border-bottom: 3px solid transparent;
      font-weight: 500;
    }

    .navbar-menu a:hover {
      color: white;
      background: rgba(255, 255, 255, 0.1);
    }

    .navbar-menu a.active {
      color: white;
      border-bottom-color: #fff;
      background: rgba(255, 255, 255, 0.15);
    }

    @media (max-width: 768px) {
      .navbar {
        flex-direction: column;
        gap: 1rem;
      }

      .navbar-menu {
        justify-content: flex-start;
        width: 100%;
        flex-wrap: wrap;
      }

      .navbar-menu a {
        padding: 0.5rem 1rem;
        font-size: 0.9rem;
      }
    }
  `]
})
export class Navbar {}
