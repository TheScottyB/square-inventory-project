# Security Guidelines

## PNPM Package Management Security

This project follows security best practices for PNPM package management:

### Dependency Management
- Always use `pnpm audit` before installing new dependencies
- Run `pnpm audit --fix` to automatically fix known vulnerabilities
- Use exact versions in `package.json` for production dependencies
- Regularly update dependencies using `pnpm update`

### Environment Variables
- Store sensitive information (API keys, tokens) in environment variables
- Use `.env` files for local development (never commit these files)
- Validate environment variables at startup
- Use secrets management for production deployments

### File Operations Security
- Validate all file paths to prevent directory traversal attacks
- Use absolute paths when possible
- Implement proper error handling for file operations
- Sanitize user inputs before file operations

### API Security
- Never commit API keys or secrets to version control
- Use secure authentication methods (API keys, OAuth)
- Implement rate limiting for API calls
- Validate and sanitize all API responses

### Code Security
- Use TypeScript for type safety
- Implement proper input validation
- Use linting tools (ESLint) with security rules
- Regular security scans using tools like `pnpm audit`

### Git Security
- Use `.gitignore` to exclude sensitive files
- Sign commits when possible
- Use branch protection rules
- Regular dependency updates via automated PRs

## Reporting Security Issues

If you discover a security vulnerability, please report it privately to the repository maintainer.
