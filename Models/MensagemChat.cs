using System;

namespace Contador_de_Historias.Models;

public class MensagemChat
{
    public int ID_Mensagem { get; set; }
    public int ID_Sessao { get; set; }
    public string Papel { get; set; } = string.Empty;
    public string Conteudo { get; set; } = string.Empty;
    public DateTime Data_Hora { get; set; }
}