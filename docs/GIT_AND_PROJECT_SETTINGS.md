# Git workflow and project settings

## Recommended Git workflow

Open **Source Control** from the left sidebar. For a new project, choose
**Initialize repository**. Create a focused branch, inspect diffs, stage only
intended files, and commit the staged set. Use **Fetch** before integrating
remote work. **Pull** is fast-forward-only, so Divex never creates an unexpected
merge commit. **Push** never forces and configures an available remote as the
upstream when needed.

Use **Stash** before temporarily switching context; it includes untracked work.
**Pop** restores the latest stash and reports conflicts instead of hiding them.

Discard is destructive. Per-file discard restores the working copy from the
index, so separately staged content remains. Discard-all restores tracked files
and removes untracked files/folders. Confirmation is enabled by default.

## Project settings

Open the project switcher and choose **Project settings…**. Settings are stored
locally under a key derived from the complete project root, so two folders with
the same name receive independent preferences. Divex does not add a settings
file to the repository.

Available preferences:

- default 2D Project or Logic view;
- workflow direction and free card positioning;
- default Explorer new-file extension;
- native/WSL live project refresh;
- Git refresh when Divex regains focus;
- confirmation before discard operations.

Branch changes, pull, stash/pop, and discard reload the project payload. This
keeps Explorer, maps, navigation, and clean editor sessions aligned with the
working tree even when live refresh is disabled.

## Safety boundaries

Git runs in Electron through fixed executable argument arrays. Native projects
use Windows Git; WSL projects use Git inside their selected distribution. File
paths remain inside the validated root, branch names are constrained, pull is
fast-forward-only, and no force-push operation is exposed.
