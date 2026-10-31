plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.traderadar.pro"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.traderadar.pro"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.1.0-dev"
    }
    buildTypes { release { isMinifyEnabled = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

// Bundle the existing Pro UI. It renders native state; WebView never runs the scanner.
val proAssets = layout.buildDirectory.dir("generated/proAssets")
val bundleProUi by tasks.registering(Copy::class) {
    from(rootProject.file("../pro/public")) { include("index.html", "app.js", "style.css", "config.js") }
    into(proAssets.map { it.dir("pro") })
}
android.sourceSets.getByName("main").assets.srcDir(proAssets)
tasks.named("preBuild").configure { dependsOn(bundleProUi) }
