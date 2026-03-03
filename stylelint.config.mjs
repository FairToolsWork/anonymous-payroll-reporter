export default {
    extends: 'stylelint-config-standard',
    ignoreFiles: ['**/*', '!pwa/**/*.css'],
    rules: {
        'selector-class-pattern': '^(?:--)?[a-z][a-z0-9-]*$',
        'property-no-vendor-prefix': null,
    },
}
