-- MySQL dump 10.13  Distrib 8.0.41, for Linux (x86_64)
--
-- Host: localhost    Database: osucollector
-- ------------------------------------------------------
-- Server version	8.0.41-0ubuntu0.24.04.1

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `beatmap_pp`
--

DROP TABLE IF EXISTS `beatmap_pp`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `beatmap_pp` (
  `map_id` int NOT NULL,
  `mods` varchar(16) NOT NULL,
  `max_pp` decimal(15,2) DEFAULT NULL,
  PRIMARY KEY (`map_id`,`mods`),
  KEY `id` (`map_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `beatmaps`
--

DROP TABLE IF EXISTS `beatmaps`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `beatmaps` (
  `id` int NOT NULL,
  `set_id` int NOT NULL,
  `mode` varchar(16) DEFAULT NULL,
  `name` longtext,
  `bpm` decimal(15,2) DEFAULT NULL,
  `length_secs` decimal(15,2) DEFAULT NULL,
  `cs` decimal(15,2) DEFAULT NULL,
  `ar` decimal(15,2) DEFAULT NULL,
  `od` decimal(15,2) DEFAULT NULL,
  `hp` decimal(15,2) DEFAULT NULL,
  `stars` decimal(15,2) DEFAULT NULL,
  `count_circles` mediumint DEFAULT NULL,
  `count_sliders` mediumint DEFAULT NULL,
  `count_spinners` mediumint DEFAULT NULL,
  `file_name` longtext,
  PRIMARY KEY (`id`,`set_id`),
  KEY `id` (`id`),
  KEY `set_id` (`set_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `beatmapset_playcount_snapshots`
--

DROP TABLE IF EXISTS `beatmapset_playcount_snapshots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `beatmapset_playcount_snapshots` (
  `set_id` int NOT NULL,
  `date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `count_plays` int NOT NULL,
  KEY `id_date` (`set_id`,`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `beatmapsets`
--

DROP TABLE IF EXISTS `beatmapsets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `beatmapsets` (
  `id` int NOT NULL,
  `title` longtext,
  `title_unicode` longtext,
  `artist` longtext,
  `artist_unicode` longtext,
  `source` longtext,
  `date_ranked` timestamp NULL DEFAULT NULL,
  `date_submitted` timestamp NULL DEFAULT NULL,
  `status` varchar(16) DEFAULT NULL,
  `mapper` varchar(64) DEFAULT NULL,
  `language` varchar(16) DEFAULT NULL,
  `tags` longtext,
  `count_plays` int DEFAULT '0',
  `count_plays_past_day` int DEFAULT '0',
  `count_plays_past_week` int DEFAULT '0',
  `count_plays_past_month` int DEFAULT '0',
  `has_video` tinyint(1) DEFAULT NULL,
  `is_nsfw` tinyint(1) DEFAULT NULL,
  `is_downloadable` tinyint(1) DEFAULT NULL,
  `file_name` longtext,
  `file_size_novideo` int DEFAULT NULL,
  `file_size_video` int DEFAULT NULL,
  `file_name_card` longtext,
  `file_name_cover` longtext,
  `file_name_preview` longtext,
  `date_saved` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `requests`
--

DROP TABLE IF EXISTS `requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `requests` (
  `date` timestamp NOT NULL,
  `ip` varchar(128) NOT NULL,
  `ua` varchar(2048) DEFAULT NULL,
  `path` varchar(2048) DEFAULT NULL,
  `query` varchar(2048) DEFAULT NULL,
  `body` blob,
  KEY `ip` (`ip`) /*!80000 INVISIBLE */,
  KEY `date_ip` (`ip`,`date`) /*!80000 INVISIBLE */,
  KEY `path` (`path`(64))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-05-05  3:39:47
