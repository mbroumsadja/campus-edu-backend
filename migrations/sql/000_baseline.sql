

CREATE TYPE public.enum_audit_logs_resultat AS ENUM (
    'succes',
    'echec'
);

CREATE TYPE public.enum_cours_statut AS ENUM (
    'en_attente',
    'publie',
    'archive'
);

CREATE TYPE public.enum_cours_type AS ENUM (
    'pdf',
    'video',
    'slide',
    'autre'
);

CREATE TYPE public.enum_sujets_session AS ENUM (
    'normale',
    'rattrapage'
);

CREATE TYPE public.enum_sujets_statut AS ENUM (
    'en_attente',
    'publie',
    'archive'
);

CREATE TYPE public.enum_sujets_type AS ENUM (
    'partiel',
    'rattrapage',
    'terminal',
    'tp',
    'td'
);

CREATE TYPE public.enum_ues_niveau AS ENUM (
    'L1',
    'L2',
    'L3',
    'M1',
    'M2'
);

CREATE TYPE public.enum_ues_semestre AS ENUM (
    'S1',
    'S2',
    'S3',
    'S4',
    'S5',
    'S6',
    'S7',
    'S8',
    'S9',
    'S10'
);

CREATE TYPE public.enum_utilisateurs_niveau AS ENUM (
    'L1',
    'L2',
    'L3',
    'M1',
    'M2'
);

CREATE TYPE public.enum_utilisateurs_role AS ENUM (
    'etudiant',
    'enseignant',
    'admin'
);

CREATE TYPE public.enum_utilisateurs_statut AS ENUM (
    'actif',
    'en_attente',
    'suspendu'
);

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    action character varying(50) NOT NULL,
    details json,
    ip_address character varying(45),
    user_agent character varying(300),
    resultat public.enum_audit_logs_resultat DEFAULT 'succes'::public.enum_audit_logs_resultat,
    created_at timestamp with time zone NOT NULL,
    utilisateur_id integer
);

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;

CREATE TABLE public.cours (
    id integer NOT NULL,
    titre character varying(200) NOT NULL,
    description text,
    type public.enum_cours_type DEFAULT 'pdf'::public.enum_cours_type,
    chemin_fichier character varying(500) NOT NULL,
    nom_fichier_original character varying(255),
    taille_fichier bigint,
    statut public.enum_cours_statut DEFAULT 'en_attente'::public.enum_cours_statut,
    anne_academique character varying(9),
    vues integer DEFAULT 0,
    telechargemements integer DEFAULT 0,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    ue_id integer,
    enseignant_id integer
);

CREATE TABLE public.cours_documents (
    id integer NOT NULL,
    cours_id integer NOT NULL,
    chemin_fichier character varying(500) NOT NULL,
    nom_fichier_original character varying(255),
    taille_fichier bigint,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.cours_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.cours_documents_id_seq OWNED BY public.cours_documents.id;

CREATE SEQUENCE public.cours_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.cours_id_seq OWNED BY public.cours.id;

CREATE TABLE public.ecoles (
    id integer NOT NULL,
    ecole character varying(255) NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.ecoles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.ecoles_id_seq OWNED BY public.ecoles.id;

CREATE TABLE public.filieres (
    id integer NOT NULL,
    code character varying(10) NOT NULL,
    nom character varying(100) NOT NULL,
    departement character varying(100),
    ecole_id integer NOT NULL,
    actif boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.filieres_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.filieres_id_seq OWNED BY public.filieres.id;

CREATE TABLE public.sujets (
    id integer NOT NULL,
    titre character varying(200) NOT NULL,
    type public.enum_sujets_type NOT NULL,
    session public.enum_sujets_session NOT NULL,
    annee integer NOT NULL,
    chemin_fichier character varying(500) NOT NULL,
    avec_corrige boolean DEFAULT false,
    chemin_corrige character varying(500),
    statut public.enum_sujets_statut DEFAULT 'en_attente'::public.enum_sujets_statut,
    telechargemements integer DEFAULT 0,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    ue_id integer,
    enseignant_id integer
);

CREATE SEQUENCE public.sujets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.sujets_id_seq OWNED BY public.sujets.id;

CREATE TABLE public.telechargements (
    id integer NOT NULL,
    utilisateur_id integer NOT NULL,
    cours_id integer NOT NULL,
    ip_address character varying(45),
    user_agent character varying(300),
    created_at timestamp with time zone NOT NULL
);

CREATE SEQUENCE public.telechargements_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.telechargements_id_seq OWNED BY public.telechargements.id;

CREATE TABLE public.ues (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    intitule character varying(150) NOT NULL,
    niveau public.enum_ues_niveau NOT NULL,
    semestre public.enum_ues_semestre NOT NULL,
    credits integer DEFAULT 3,
    actif boolean DEFAULT true,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    filiere_id integer
);

CREATE SEQUENCE public.ues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.ues_id_seq OWNED BY public.ues.id;

CREATE TABLE public.utilisateurs (
    id integer NOT NULL,
    matricule character varying(20) NOT NULL,
    nom character varying(80) NOT NULL,
    prenom character varying(80) NOT NULL,
    email character varying(150),
    password character varying(255) NOT NULL,
    role public.enum_utilisateurs_role DEFAULT 'etudiant'::public.enum_utilisateurs_role NOT NULL,
    statut public.enum_utilisateurs_statut DEFAULT 'en_attente'::public.enum_utilisateurs_statut,
    niveau public.enum_utilisateurs_niveau,
    refresh_token text,
    derniere_connexion timestamp with time zone,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    filiere_id integer
);

CREATE SEQUENCE public.utilisateurs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.utilisateurs_id_seq OWNED BY public.utilisateurs.id;

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);

ALTER TABLE ONLY public.cours ALTER COLUMN id SET DEFAULT nextval('public.cours_id_seq'::regclass);

ALTER TABLE ONLY public.cours_documents ALTER COLUMN id SET DEFAULT nextval('public.cours_documents_id_seq'::regclass);

ALTER TABLE ONLY public.ecoles ALTER COLUMN id SET DEFAULT nextval('public.ecoles_id_seq'::regclass);

ALTER TABLE ONLY public.filieres ALTER COLUMN id SET DEFAULT nextval('public.filieres_id_seq'::regclass);

ALTER TABLE ONLY public.sujets ALTER COLUMN id SET DEFAULT nextval('public.sujets_id_seq'::regclass);

ALTER TABLE ONLY public.telechargements ALTER COLUMN id SET DEFAULT nextval('public.telechargements_id_seq'::regclass);

ALTER TABLE ONLY public.ues ALTER COLUMN id SET DEFAULT nextval('public.ues_id_seq'::regclass);

ALTER TABLE ONLY public.utilisateurs ALTER COLUMN id SET DEFAULT nextval('public.utilisateurs_id_seq'::regclass);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cours_documents
    ADD CONSTRAINT cours_documents_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.cours
    ADD CONSTRAINT cours_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ecoles
    ADD CONSTRAINT ecoles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.filieres
    ADD CONSTRAINT filieres_code_key UNIQUE (code);

ALTER TABLE ONLY public.filieres
    ADD CONSTRAINT filieres_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sujets
    ADD CONSTRAINT sujets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.telechargements
    ADD CONSTRAINT telechargements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ues
    ADD CONSTRAINT ues_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_email_key UNIQUE (email);

ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_matricule_key UNIQUE (matricule);

ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_pkey PRIMARY KEY (id);

CREATE INDEX audit_logs_action ON public.audit_logs USING btree (action);

CREATE INDEX audit_logs_created_at ON public.audit_logs USING btree (created_at);

CREATE INDEX audit_logs_utilisateur_id ON public.audit_logs USING btree (utilisateur_id);

CREATE INDEX cours_documents_cours_id ON public.cours_documents USING btree (cours_id);

CREATE INDEX cours_enseignant_id ON public.cours USING btree (enseignant_id);

CREATE INDEX cours_statut ON public.cours USING btree (statut);

CREATE INDEX cours_ue_id ON public.cours USING btree (ue_id);

CREATE INDEX sujets_annee ON public.sujets USING btree (annee);

CREATE INDEX sujets_statut ON public.sujets USING btree (statut);

CREATE INDEX sujets_ue_id ON public.sujets USING btree (ue_id);

CREATE INDEX telechargements_cours_id ON public.telechargements USING btree (cours_id);

CREATE INDEX telechargements_utilisateur_id ON public.telechargements USING btree (utilisateur_id);

CREATE UNIQUE INDEX ues_code_filiere_id ON public.ues USING btree (code, filiere_id);

CREATE INDEX ues_filiere_id ON public.ues USING btree (filiere_id);

CREATE INDEX ues_niveau ON public.ues USING btree (niveau);

CREATE INDEX utilisateurs_filiere_id ON public.utilisateurs USING btree (filiere_id);

CREATE INDEX utilisateurs_matricule ON public.utilisateurs USING btree (matricule);

CREATE INDEX utilisateurs_role ON public.utilisateurs USING btree (role);

CREATE INDEX utilisateurs_statut ON public.utilisateurs USING btree (statut);

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES public.utilisateurs(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.cours_documents
    ADD CONSTRAINT cours_documents_cours_id_fkey FOREIGN KEY (cours_id) REFERENCES public.cours(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.cours
    ADD CONSTRAINT cours_enseignant_id_fkey FOREIGN KEY (enseignant_id) REFERENCES public.utilisateurs(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.cours
    ADD CONSTRAINT cours_ue_id_fkey FOREIGN KEY (ue_id) REFERENCES public.ues(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.filieres
    ADD CONSTRAINT filieres_ecole_id_fkey FOREIGN KEY (ecole_id) REFERENCES public.ecoles(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.sujets
    ADD CONSTRAINT sujets_enseignant_id_fkey FOREIGN KEY (enseignant_id) REFERENCES public.utilisateurs(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.sujets
    ADD CONSTRAINT sujets_ue_id_fkey FOREIGN KEY (ue_id) REFERENCES public.ues(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.telechargements
    ADD CONSTRAINT telechargements_cours_id_fkey FOREIGN KEY (cours_id) REFERENCES public.cours(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.telechargements
    ADD CONSTRAINT telechargements_utilisateur_id_fkey FOREIGN KEY (utilisateur_id) REFERENCES public.utilisateurs(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public.ues
    ADD CONSTRAINT ues_filiere_id_fkey FOREIGN KEY (filiere_id) REFERENCES public.filieres(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public.utilisateurs
    ADD CONSTRAINT utilisateurs_filiere_id_fkey FOREIGN KEY (filiere_id) REFERENCES public.filieres(id) ON UPDATE CASCADE ON DELETE SET NULL;


