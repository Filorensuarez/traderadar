plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.traderadar.pro"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.traderadar.pro"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "1.0.0"
    }
    buildTypes { release { isMinifyEnabled = false } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}