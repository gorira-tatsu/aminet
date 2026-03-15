# Releasing aminet

## Checklist

1. Merge `dev` into `main`
2. Bump `package.json` version
3. Commit and push `main`
4. Create and push `v<version>` tag
5. Verify the publish workflow succeeds
6. Verify npm package page is updated
7. Verify the GitHub Release body contains:
   - npm package URL
   - install examples
   - action usage example

## Manual publish fallback

- The `Publish aminet` workflow can also be started with `workflow_dispatch`.
- Set `ref` to the branch or tag you want to publish from.
- Set `tag_name` only when you also want a GitHub Release. `tag_name` must match `package.json`.
- Manual branch publishes skip GitHub Release creation unless `tag_name` is provided.

## Notes

- npmjs.org is the canonical registry
- Publishing uses npm trusted publishing with GitHub OIDC
- npm trusted publisher configuration in npm package settings must allow this repository workflow
- The release workflow expects the git tag version to exactly match `package.json`
