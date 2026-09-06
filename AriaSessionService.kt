package com.aria
import android.service.voice.VoiceInteractionSession
import android.service.voice.VoiceInteractionSessionService
class AriaSessionService: VoiceInteractionSessionService(){override fun onNewSession(args: android.os.Bundle?): VoiceInteractionSession = VoiceInteractionSession(this)}
