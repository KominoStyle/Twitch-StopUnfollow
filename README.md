# Twitch-StopUnfollow

Twitch-StopUnfollow is a Tampermonkey userscript that helps you avoid unfollowing your favourite streamers by accident. It injects a **Stop Unfollow** option into the avatar settings menu and disables the Unfollow button for channels you save.

## Features

- Adds a Stop Unfollow entry under the avatar settings dropdown.
- Draggable modal to manage a list of saved channels.
- One-click button to add the current channel or enter a name manually.
- Search and sort your saved list.
- Import multiple channels at once; usernames are validated before adding.
- Disables the Unfollow button on saved channels across navigation.
- Styled avatar menu entry built in; no extension needed.
- Automatically checks GitHub for updates and shows an Install button inside the menu when a newer version is detected.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open [`StopUnfollow.user.js`](./StopUnfollow.user.js), click "Raw" and confirm the install.

## Usage

1. Click your Twitch avatar and select **Stop Unfollow**.
2. Use the modal to add channels or remove them from the list.
3. Use the **Import List** button to paste multiple names at once.
4. The Unfollow button will be disabled when visiting any saved channel.
5. The modal can be dragged around and closed with the **×** in the header.
6. When a newer version is published a notice with an **Install** button appears inside the Stop Unfollow menu; click it to open the latest script.

## License

Released under the [BSD 3-Clause License](LICENSE). © 2025 !♥Koͨmͧiͭnͥoͤ Style♥!
