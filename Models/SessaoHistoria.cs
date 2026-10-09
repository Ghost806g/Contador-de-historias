using System;

namespace Contador_de_Historias.Models;

public class SessaoHistoria
{
    public int ID_Sessao { get; set; }
    public string Nome_Personagem { get; set; } = string.Empty;
    public string Cenario_Contexto { get; set; } = string.Empty;
    public DateTime Data_Criacao { get; set; }
    public string Status { get; set; } = "Ativa";
}