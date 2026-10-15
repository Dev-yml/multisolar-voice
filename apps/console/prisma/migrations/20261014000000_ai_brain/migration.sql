-- AI brain (Claude), Sarvam voice, keypad hand-over numbers and call length.
ALTER TABLE "AgentSettings" ADD COLUMN "brain" VARCHAR(10) NOT NULL DEFAULT 'claude';
ALTER TABLE "AgentSettings" ADD COLUMN "claudeModel" VARCHAR(40) NOT NULL DEFAULT 'claude-opus-5-5';
ALTER TABLE "AgentSettings" ADD COLUMN "ttsModel" VARCHAR(30) NOT NULL DEFAULT 'bulbul:v3';
ALTER TABLE "AgentSettings" ADD COLUMN "ttsSpeaker" VARCHAR(60);
ALTER TABLE "AgentSettings" ADD COLUMN "salesHeadNumber" VARCHAR(20);
ALTER TABLE "AgentSettings" ADD COLUMN "crmNumber" VARCHAR(20);
ALTER TABLE "AgentSettings" ADD COLUMN "keypadMenu" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "AgentSettings" ADD COLUMN "maxCallSeconds" INTEGER NOT NULL DEFAULT 210;
