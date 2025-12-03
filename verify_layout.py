import os
import time
from playwright.sync_api import sync_playwright

def run():
    print(f"CWD: {os.getcwd()}")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})

        try:
            print("Navigating...")
            page.goto("http://localhost:8080/index.html")
            page.wait_for_selector("#terminal", state="visible", timeout=5000)

            # Ensure focused
            page.click("#terminal")

            # Type toggletui
            print("Typing 'toggletui'...")
            page.keyboard.type("toggletui")
            page.keyboard.press("Enter")

            # Wait for TUI mode
            print("Waiting for TUI mode...")
            page.wait_for_selector("#tui-mode-container", state="visible", timeout=5000)

            # Test TUI Navigation
            print("Testing TUI Navigation...")
            # We expect the sidebar to be focused first
            # Press ArrowDown to select next item
            page.keyboard.press("ArrowDown")

            # Check if active element changed or status bar updated
            # The app updates #tui-status-bar with "Selected: <command>"
            status_text = page.locator("#tui-status-bar").text_content()
            print(f"Status Bar Text after ArrowDown: {status_text}")

            if not status_text or "Sidebar is empty" in status_text:
                print("Warning: Navigation might not be working or sidebar empty.")
            else:
                print("Navigation seems to affect status bar.")

            output_path = "/app/verification_tui_nav.png"
            print(f"Taking screenshot to {output_path}...")
            page.screenshot(path=output_path)
            print(f"Screenshot saved to {os.path.abspath(output_path)}")

        except Exception as e:
            print(f"Error: {e}")
            # Take a failure screenshot
            page.screenshot(path="/app/verification_failure.png")
        finally:
            browser.close()

if __name__ == "__main__":
    run()
