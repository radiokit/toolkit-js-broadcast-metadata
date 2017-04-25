var gulp = require('gulp');
var typedoc = require("gulp-typedoc");

gulp.task("typedoc", function() {
  return gulp
    .src(["lib/**/*.ts"])
    .pipe(typedoc({
      module: "commonjs",
      target: "es2015",
      out: "docs/",
      theme: "minimal",
      name: "RadioKit Toolkit JS: Broadcast Metadata",
      excludePrivate: true,
   }));
});

