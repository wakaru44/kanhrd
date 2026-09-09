import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { ThemeService } from './state/theme.service';
import { LayoutService } from './state/layout.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly themeService = inject(ThemeService);
  protected readonly layout = inject(LayoutService);

  protected toggleTheme(): void {
    this.themeService.toggle();
  }

  protected toggleRail(): void {
    this.layout.toggleRail();
  }
}
