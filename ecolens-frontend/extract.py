import re
import os

filepath = 'public/index.html'
with open(filepath, 'r') as f:
    content = f.read()

# Extract styles
style_pattern = re.compile(r'<style>(.*?)</style>', re.DOTALL)
styles = style_pattern.findall(content)
if styles:
    with open('public/styles.css', 'w') as f:
        f.write(styles[0].strip())
    content = style_pattern.sub('<link rel="stylesheet" href="styles.css">', content, count=1)

# Extract scripts (skip the first ones which are external library imports or the firebase one if present)
# Specifically trying to find the block containing const ITEMS = ...
script_pattern = re.compile(r'<script>(.*?const ITEMS = .*?)</script>', re.DOTALL)
scripts = script_pattern.findall(content)
if scripts:
    with open('public/app.js', 'w') as f:
        f.write(scripts[0].strip())
    content = script_pattern.sub('<script src="app.js"></script>', content, count=1)

with open(filepath, 'w') as f:
    f.write(content)

print("Extraction complete")
