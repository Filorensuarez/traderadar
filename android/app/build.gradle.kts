import java.security.MessageDigest
import groovy.json.JsonOutput

plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
android {
    namespace = "com.traderadar.pro"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.traderadar.pro"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "1.1.1-security-dev"
    }
    val releaseStore = System.getenv("ANDROID_SIGNING_STORE")
    if (!releaseStore.isNullOrBlank()) {
        signingConfigs.create("distribution") {
            storeFile = file(releaseStore)
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            isDebuggable = false
            if (!releaseStore.isNullOrBlank()) signingConfig = signingConfigs.getByName("distribution")
        }
    }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

// Bundle the existing Pro UI. It renders native state; WebView never runs the scanner.
val proAssets = layout.buildDirectory.dir("generated/proAssets")
val bundleProUi by tasks.registering(Copy::class) {
    from(rootProject.file("../pro/public")) { include("index.html", "app.js", "style.css", "config.js", "android-transport.js") }
    into(proAssets.map { it.dir("pro") })
}
android.sourceSets.getByName("main").assets.srcDir(proAssets)
tasks.named("preBuild").configure { dependsOn(bundleProUi) }

// Report the actually resolved APK runtime libraries, not guessed source versions.
tasks.register("writeRuntimeSecurityDependencies") {
    doLast {
        val variant = System.getenv("APK_VARIANT") ?: "debug"
        require(variant in listOf("debug", "release")) { "Unsupported security report variant" }
        val libraries = configurations.getByName("${variant}RuntimeClasspath").resolvedConfiguration.resolvedArtifacts.map { artifact ->
            val id = artifact.moduleVersion.id
            val hash = MessageDigest.getInstance("SHA-256").digest(artifact.file.readBytes()).joinToString("") { "%02x".format(it) }
            mapOf("group" to id.group, "name" to id.name, "version" to id.version, "sha256" to hash)
        }.sortedBy { it["group"] + ":" + it["name"] }
        val output = rootProject.file("../artifacts/android-runtime-dependencies.json")
        output.parentFile.mkdirs()
        output.writeText(JsonOutput.prettyPrint(JsonOutput.toJson(mapOf("variant" to variant, "scope" to "APK runtime Maven artifacts", "libraries" to libraries))))
    }
}
