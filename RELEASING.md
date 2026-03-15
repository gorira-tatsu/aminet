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

## Notes

- npmjs.org is the canonical registry
- Publishing uses npm trusted publishing with GitHub OIDC
- The release workflow expects the git tag version to exactly match `package.json`
