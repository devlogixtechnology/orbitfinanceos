"use client";

import { useState } from "react";

type ThemePreference = "system" | "light" | "dark";

export function ThemeSelector({
  initialTheme,
}: Readonly<{ initialTheme: ThemePreference }>) {
  const [theme, setTheme] = useState(initialTheme);

  function applyTheme(nextTheme: ThemePreference) {
    setTheme(nextTheme);
    if (nextTheme === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.dataset.theme = nextTheme;
    }
    document.cookie = `orbitos_theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  return (
    <div className="theme-field">
      <label htmlFor="theme-preference">Theme</label>
      <select
        id="theme-preference"
        onChange={(event) => applyTheme(event.target.value as ThemePreference)}
        value={theme}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
}
