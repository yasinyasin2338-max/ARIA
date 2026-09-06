package com.aria
import android.content.Intent
import android.service.voice.VoiceInteractionService
class AriaVoiceInteractionService: VoiceInteractionService(){
 override fun onReady(){super.onReady()}
 override fun onLaunchVoiceAssistFromKeyguard(){startActivity(Intent(this,MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP))}
}
