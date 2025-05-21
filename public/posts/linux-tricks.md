```markdown
# Linux Power Tricks

Some useful commands and concepts for Linux users.

## Finding Files Efficiently

The `find` command is incredibly powerful.
Example: Find all `.log` files modified in the last 7 days in `/var/log`.
```bash
find /var/log -name "*.log" -mtime -7 -type f
Managing Disk Usage
The du (disk usage) and df (disk free) commands are essential.
To see a human-readable summary of disk usage for directories:

Bash

du -sh /path/to/directory/*
To check filesystem disk space usage:

Bash

df -h
Text Processing with awk and sed
awk and sed are your best friends for text manipulation.
Example: Print the first column of a CSV file:

Awk

awk -F',' '{print $1}' data.csv
Example: Replace "foo" with "bar" in all text files:

Bash

sed -i 's/foo/bar/g' *.txt
Bash Shortcuts
Ctrl + R: Search command history.
Ctrl + L: Clear screen (like the clear command).
!!: Repeat the last command.
This is just a small taste. The Linux command line is a vast and powerful tool!


---
