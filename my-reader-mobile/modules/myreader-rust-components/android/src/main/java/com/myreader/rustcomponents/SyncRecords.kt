package com.myreader.rustcomponents

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord

@OptimizedRecord
data class SyncRemoteObjectRecord(
  @Field val objectPath: String = "",
  @Field val head: String = "",
  @Field val bytes: ByteArray = byteArrayOf(),
  @Field val sha256: String = "",
) : Record
