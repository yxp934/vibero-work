# vibero-work

This workspace tracks Vibero's unpacked `omni.ja` contents in Git.

## Layout

- `omni/`: unpacked app source to edit and version
- `hyphenation/`: copied from the app bundle for reference
- `application.ini`: copied from the app bundle
- `build/`: generated artifacts, ignored by Git

## Rebuild

```bash
cd /Users/yxp/dev/vibero-work
./repack.sh
```

This rebuilds:

```text
/Users/yxp/dev/vibero-work/build/omni.ja
```

## Install back into the app

```bash
cd /Users/yxp/dev/vibero-work
./repack.sh --install /Users/yxp/Downloads/Vibero.app
```

If the app path is omitted, the default target is:

```text
/Users/yxp/Downloads/Vibero.app
```

The script always creates a timestamped backup before replacing `omni.ja`.

## First commit

```bash
cd /Users/yxp/dev/vibero-work
git add .
git commit -m "chore: initialize vibero unpacked workspace"
```

## Launch patched app with existing profile

```bash
open -na /Users/yxp/Downloads/Vibero.app --args \
  -app /Users/yxp/Downloads/Vibero.app/Contents/Resources/app/application.ini \
  -profile '/Users/yxp/Library/Application Support/Vibero/Profiles/ivrlfzqm.default'
```
